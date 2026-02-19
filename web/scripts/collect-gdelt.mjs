/**
 * Collect candidate event links from GDELT Doc API and output JSONL rows
 * compatible with ingest-events.mjs.
 *
 * Usage:
 *   node ./scripts/collect-gdelt.mjs --out ./data/out.jsonl --from 2026-01-01 --to 2026-02-11
 *
 * Notes:
 * - This is a "coverage" collector. It does NOT verify claims.
 * - It is intentionally conservative about media downloading (handled by ingest step).
 */
import fs from "node:fs";
import path from "node:path";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
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
  const s = isoDay(d).replaceAll("-", "");
  return s;
}

function must(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "TimelineCollector/0.1 (+https://github.com/toorajhelmi/timeline)",
      },
    });

    if (res.status === 429 || res.status >= 500) {
      const backoffMs = Math.min(20_000, 1000 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const text = await res.text();
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
  // Keep query simple to avoid GDELT parser limits. We'll broaden later once stable.
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

  const j = await fetchJson(url);
  const arts = Array.isArray(j?.articles) ? j.articles : [];
  return arts;
}

function toJsonlRow(article) {
  const url = article?.url;
  const title = article?.title ?? null;
  const seen = article?.seendate ?? null;
  const sourceCountry = article?.sourceCountry ?? null;
  const domain = article?.domain ?? null;

  let time_start = new Date().toISOString();
  if (seen) {
    const d1 = new Date(seen);
    if (!Number.isNaN(d1.valueOf())) {
      time_start = d1.toISOString();
    } else if (typeof seen === "string" && /^\d{14}$/.test(seen)) {
      // YYYYMMDDhhmmss (UTC)
      const iso =
        `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}T` +
        `${seen.slice(8, 10)}:${seen.slice(10, 12)}:${seen.slice(12, 14)}.000Z`;
      const d2 = new Date(iso);
      if (!Number.isNaN(d2.valueOf())) time_start = d2.toISOString();
    }
  }
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
  const maxPerDay = clampInt(argValue("--max-per-day"), 50);

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

    for (const a of arts) {
      const url = a?.url;
      if (!url) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      lines.push(JSON.stringify(toJsonlRow(a)));
    }

    // progress
    process.stderr.write(`Collected ${dayLabel}: +${arts.length} (dedup total ${seenUrls.size})\n`);
  }

  fs.writeFileSync(outAbs, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  console.log(JSON.stringify({ ok: true, out: outAbs, rows: lines.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

