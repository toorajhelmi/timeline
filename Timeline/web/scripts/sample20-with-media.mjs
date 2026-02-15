/**
 * Build a 20-item sample from an existing GDELT JSONL file.
 * Attempts to extract og:image and a direct og:video (mp4/webm) if present.
 *
 * Usage:
 *   node ./scripts/sample20-with-media.mjs \
 *     --in ./data/iran-revo-2026.gdelt.2026-02-09_2026-02-11.jsonl \
 *     --out ./data/iran-revo-2026.sample20.with-media.jsonl
 */
import fs from "node:fs";
import path from "node:path";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function must(v, msg) {
  if (!v) throw new Error(msg);
  return v;
}

function parseJsonl(file) {
  const abs = path.resolve(process.cwd(), file);
  const lines = fs.readFileSync(abs, "utf8").split("\n").filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TimelineSampler/0.1 (+https://github.com/toorajhelmi/timeline)",
      accept: "text/html,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractMeta(html, key) {
  // property="og:image" content="..."
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]+)"[^>]*>`,
    "i",
  );
  const m1 = html.match(re1);
  if (m1?.[1]) return m1[1];

  // content="..." property="og:image"
  const re2 = new RegExp(
    `<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="${key}"[^>]*>`,
    "i",
  );
  const m2 = html.match(re2);
  if (m2?.[1]) return m2[1];

  return null;
}

function normalizeUrl(u) {
  if (!u) return null;
  try {
    return new URL(u).toString();
  } catch {
    return null;
  }
}

function isDirectVideoUrl(u) {
  const s = u.toLowerCase();
  return s.endsWith(".mp4") || s.endsWith(".webm") || s.endsWith(".mov");
}

async function enrich(row) {
  const url = row?.source_urls?.[0];
  if (!url) return { ...row, media: [] };

  try {
    const html = await fetchHtml(url);
    const ogImage =
      normalizeUrl(extractMeta(html, "og:image")) ??
      normalizeUrl(extractMeta(html, "twitter:image"));

    const ogVideo =
      normalizeUrl(extractMeta(html, "og:video")) ??
      normalizeUrl(extractMeta(html, "og:video:url")) ??
      normalizeUrl(extractMeta(html, "og:video:secure_url")) ??
      normalizeUrl(extractMeta(html, "twitter:player:stream"));

    const media = [];
    if (ogImage) media.push({ kind: "image", url: ogImage });
    if (ogVideo && isDirectVideoUrl(ogVideo)) media.push({ kind: "video", url: ogVideo });

    return { ...row, media };
  } catch {
    return { ...row, media: [] };
  }
}

async function main() {
  const input = must(argValue("--in"), "Missing --in");
  const out = must(argValue("--out"), "Missing --out");

  const rows = parseJsonl(input);

  const wantTotal = 20;
  const wantVideo = 3;
  const wantImage = 7;

  const selected = [];
  const pickedUrls = new Set();

  const withVideo = [];
  const withImage = [];
  const textOnly = [];

  // Try a bit more than needed to find video/image pages.
  for (const r of rows.slice(0, 80)) {
    if (selected.length >= wantTotal) break;
    const url = r?.source_urls?.[0];
    if (!url || pickedUrls.has(url)) continue;
    pickedUrls.add(url);

    const enriched = await enrich(r);
    const hasVideo = (enriched.media ?? []).some((m) => m.kind === "video");
    const hasImage = (enriched.media ?? []).some((m) => m.kind === "image");

    if (hasVideo && withVideo.length < wantVideo) {
      withVideo.push(enriched);
      continue;
    }
    if (hasImage && withImage.length < wantImage) {
      withImage.push(enriched);
      continue;
    }
    if (!hasVideo && !hasImage && textOnly.length < wantTotal) {
      textOnly.push(enriched);
    }
  }

  // Fill remaining slots
  selected.push(...withVideo, ...withImage);
  for (const r of textOnly) {
    if (selected.length >= wantTotal) break;
    selected.push(r);
  }

  // If still short, just take more (even if text-only)
  if (selected.length < wantTotal) {
    for (const r of rows) {
      if (selected.length >= wantTotal) break;
      const url = r?.source_urls?.[0];
      if (!url || selected.some((x) => x?.source_urls?.[0] === url)) continue;
      selected.push({ ...r, media: [] });
    }
  }

  const absOut = path.resolve(process.cwd(), out);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(
    absOut,
    selected.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  const counts = {
    total: selected.length,
    withImage: selected.filter((r) => (r.media ?? []).some((m) => m.kind === "image"))
      .length,
    withVideo: selected.filter((r) => (r.media ?? []).some((m) => m.kind === "video"))
      .length,
  };

  // Fallback: if we couldn't find direct article videos, attach a few small,
  // stable Commons videos so you can test the full video pipeline end-to-end.
  if (counts.withVideo === 0) {
    const fallbackVideos = [
      {
        page: "https://commons.wikimedia.org/wiki/File:Supreme_Leader_of_Iran_Ali_Khamenei_and_the_Claim_of_Speaking_with_God.webm",
        url: "https://upload.wikimedia.org/wikipedia/commons/0/08/Supreme_Leader_of_Iran_Ali_Khamenei_and_the_Claim_of_Speaking_with_God.webm",
      },
      {
        page: "https://commons.wikimedia.org/wiki/File:Tour_guide_recite_Adhan_in_the_Shah_mosque_in_Isfahan,_Iran.webm",
        url: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Tour_guide_recite_Adhan_in_the_Shah_mosque_in_Isfahan%2C_Iran.webm",
      },
      {
        page: "https://commons.wikimedia.org/wiki/File:Mp4_webm_test.webm",
        url: "https://upload.wikimedia.org/wikipedia/commons/2/2a/Mp4_webm_test.webm",
      },
    ];

    for (let i = 0; i < Math.min(wantVideo, selected.length); i++) {
      const v = fallbackVideos[i];
      const row = selected[i];
      const nextSources = Array.from(new Set([...(row.source_urls ?? []), v.page]));
      const nextMedia = Array.isArray(row.media) ? [...row.media] : [];
      nextMedia.push({ kind: "video", url: v.url });
      selected[i] = { ...row, source_urls: nextSources, media: nextMedia };
    }
  }

  const finalCounts = {
    total: selected.length,
    withImage: selected.filter((r) => (r.media ?? []).some((m) => m.kind === "image"))
      .length,
    withVideo: selected.filter((r) => (r.media ?? []).some((m) => m.kind === "video"))
      .length,
  };
  console.log(JSON.stringify({ ok: true, out: absOut, counts: finalCounts }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

