export function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function gdeltDateYYYYMMDD(d) {
  return isoDay(d).replaceAll("-", "");
}

export function parseSeenDate(seen) {
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
  // GDELT Doc API commonly returns: "YYYYMMDDTHHMMSSZ" (e.g. "20251227T080000Z")
  if (typeof seen === "string" && /^\d{8}T\d{6}Z$/.test(seen)) {
    const iso =
      `${seen.slice(0, 4)}-${seen.slice(4, 6)}-${seen.slice(6, 8)}T` +
      `${seen.slice(9, 11)}:${seen.slice(11, 13)}:${seen.slice(13, 15)}.000Z`;
    const d2 = new Date(iso);
    if (!Number.isNaN(d2.valueOf())) return d2.toISOString();
  }
  return null;
}

export async function fetchText(url, { accept = "*/*" } = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TimelineCollector/0.1 (+https://github.com/toorajhelmi/timeline)",
      accept,
    },
  });
  return { res, text: await res.text() };
}

export async function fetchJsonWithBackoff(url) {
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

export function normalizeUrl(u, baseUrl) {
  if (!u) return null;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractMeta(html, key) {
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

export function isDirectVideoUrl(u) {
  const s = u.toLowerCase();
  return s.endsWith(".mp4") || s.endsWith(".webm") || s.endsWith(".mov");
}

export async function enrichOgMedia(url) {
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

export function buildDefaultIranUpriseQuery() {
  return [
    "(Iran OR Iranian OR Tehran)",
    "(protest OR protests OR uprising OR revolution OR crackdown OR demonstration OR strike OR killed OR deaths OR arrest OR execution OR internet OR blackout)",
  ].join(" ");
}

export async function collectGdeltDocDay({ day, maxRecords, query }) {
  const start = `${gdeltDateYYYYMMDD(day)}000000`;
  const end = `${gdeltDateYYYYMMDD(day)}235959`;
  const q = encodeURIComponent(query);
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc" +
    `?query=${q}` +
    `&mode=artlist&format=json` +
    `&startdatetime=${start}&enddatetime=${end}` +
    `&maxrecords=${maxRecords}` +
    `&sort=hybridrel`;

  const j = await fetchJsonWithBackoff(url);
  return Array.isArray(j?.articles) ? j.articles : [];
}

