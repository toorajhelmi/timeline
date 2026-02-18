/**
 * Collect candidate event links from GDELT Doc API and (optionally) enrich a
 * subset with og:image / og:video URLs.
 *
 * Usage:
 *   node ./scripts/collect-gdelt-enriched.mjs \
 *     --out ./data/iran-uprise-2026.gdelt.jsonl \
 *     --from 2025-12-27 --to 2026-02-12 \
 *     --max-per-day 40 --media-per-day 8
 *
 * Notes:
 * - This is "coverage" collection. It is not verification.
 * - Media enrichment is best-effort and will fail on many sites (bot blocks, JS apps).
 */
import fs from "node:fs";
import path from "node:path";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function must(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}

function clampInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : def;
}

function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function gdeltDateYYYYMMDD(d) {
  return isoDay(d).replaceAll("-", "");
}

async function fetchText(url, { accept = "*/*" } = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TimelineCollector/0.1 (+https://github.com/toorajhelmi/timeline)",
      accept,
    },
  });
  return { res, text: await res.text() };
}

async function fetchJsonWithBackoff(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { res, text } = await fetchText(url, { accept: "application/json,*/*" });

    if (res.status === 429 || res.status >= 500) {
      const backoffMs = Math.min(20_000, 1000 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    try {
      return JSON.parse(text);
    } catch {
      const snippet = text.slice(0, 240).replaceAll("\n", " ");
      throw new Error(`Non-JSON response from GDELT: ${snippet}`);
    }
  }
  throw new Error(`GDELT rate-limited/unavailable after retries: ${url}`);
}

function buildQuery() {
  // Keep it stable/simple. We can broaden later once ingestion flow is solid.
  return [
    "(Iran OR Iranian OR Tehran)",
    "(protest OR protests OR uprising OR revolution OR crackdown OR demonstration OR strike OR killed OR deaths OR arrest OR execution OR internet OR blackout)",
  ].join(" ");
}

async function collectForDay({ day, maxRecords }) {
  const start = `${gdeltDateYYYYMMDD(day)}000000`;
  const end = `${gdeltDateYYYYMMDD(day)}235959`;
  const query = encodeURIComponent(buildQuery());
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    `?query=${query}` +
    `&mode=artlist&format=json` +
    `&startdatetime=${start}&enddatetime=${end}` +
    `&maxrecords=${maxRecords}` +
    `&sort=hybridrel`;

  const j = await fetchJsonWithBackoff(url);
  return Array.isArray(j?.articles) ? j.articles : [];
}

function parseSeenDate(seen) {
  if (!seen) return null;
  const d1 = new Date(seen);
  if (!Number.isNaN(d1.valueOf())) return d1.toISOString();
  if (typeof seen === "string" && /^\d{14}$/.test(seen)) {
    const iso =
      `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}T` +
      `${seen.slice(8, 10)}:${seen.slice(10, 12)}:${seen.slice(12, 14)}.000Z`;
    const d2 = new Date(iso);
    if (!Number.isNaN(d2.valueOf())) return d2.toISOString();
  }
  return null;
}

function extractMeta(html, key) {
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]+)"[^>]*>`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return m1[1];

  const re2 = new RegExp(
    `<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${key}"[^>]*>`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return m2[1];
  return null;
}

function normalizeUrl(u, baseUrl) {
  if (!u) return null;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return null;
  }
}

function isDirectVideoUrl(u) {
  const s = u.toLowerCase();
  return s.endsWith(".mp4") || s.endsWith(".webm") || s.endsWith(".mov");
}

async function enrichMedia(url) {
  try {
    const { res, text } = await fetchText(url, { accept: "text/html,*/*" });
    if (!res.ok) return [];

    const ogImage =
      normalizeUrl(extractMeta(text, "og:image"), url) ??
      normalizeUrl(extractMeta(text, "twitter:image"), url);

    const ogVideo =
      normalizeUrl(extractMeta(text, "og:video"), url) ??
      normalizeUrl(extractMeta(text, "og:video:url"), url) ??
      normalizeUrl(extractMeta(text, "og:video:secure_url"), url) ??
      normalizeUrl(extractMeta(text, "twitter:player:stream"), url);

    const media = [];
    if (ogImage) media.push({ kind: "image", url: ogImage });
    if (ogVideo && isDirectVideoUrl(ogVideo)) media.push({ kind: "video", url: ogVideo });
    return media;
  } catch {
    return [];
  }
}

function toJsonlRow(article) {
  const url = article?.url;
  const title = article?.title ?? null;
  const seen = article?.seendate ?? null;
  const domain = article?.domain ?? null;
  const sourceCountry = article?.sourceCountry ?? null;

  const time_start = parseSeenDate(seen) ?? new Date().toISOString();
  const bodyParts = [
    domain ? `Source: ${domain}` : null,
    sourceCountry ? `Source country: ${sourceCountry}` : null,
  ].filter(Boolean);

  return {
    time_start,
    type: "update",
    title,
    body: bodyParts.join("\n") || "Linked source article.",
    status: "active",
    source_urls: url ? [url] : [],
    media: [],
  };
}

async function main() {
  const out = must(argValue("--out"), "Missing --out");
  const from = must(argValue("--from"), "Missing --from (YYYY-MM-DD)");
  const to = must(argValue("--to"), "Missing --to (YYYY-MM-DD)");
  const maxPerDay = clampInt(argValue("--max-per-day"), 40);
  const mediaPerDay = clampInt(argValue("--media-per-day"), 8);
  const noMedia = hasFlag("--no-media");

  const fromD = new Date(`${from}T00:00:00.000Z`);
  const toD = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(fromD.valueOf()) || Number.isNaN(toD.valueOf())) {
    throw new Error("Invalid --from/--to date");
  }

  const outAbs = path.resolve(process.cwd(), out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  const seenUrls = new Set();
  const lines = [];

  for (let d = fromD; d <= toD; d = addDays(d, 1)) {
    const dayLabel = isoDay(d);
    const arts = await collectForDay({ day: d, maxRecords: maxPerDay });
    let enriched = 0;

    for (const a of arts) {
      const url = a?.url;
      if (!url) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const row = toJsonlRow(a);

      if (!noMedia && enriched < mediaPerDay) {
        const media = await enrichMedia(url);
        if (media.length) {
          row.media = media;
          enriched += 1;
        }
      }

      lines.push(JSON.stringify(row));
    }

    process.stderr.write(
      `Collected ${dayLabel}: +${arts.length} (dedup total ${seenUrls.size}) enriched ${enriched}\n`,
    );
  }

  fs.writeFileSync(outAbs, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  console.log(JSON.stringify({ ok: true, out: outAbs, rows: lines.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

