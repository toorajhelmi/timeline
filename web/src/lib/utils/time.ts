export type Zoom = "year" | "month" | "week" | "day";

export function clampZoom(z?: string): Zoom {
  if (z === "year" || z === "month" || z === "week" || z === "day") return z;
  return "day";
}

export function defaultRangeForZoom(zoom: Zoom): { from: Date; to: Date } {
  // Include a small future buffer so entries later "today" (local time)
  // don't disappear due to server-side UTC ranges.
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const from = new Date(to);
  if (zoom === "year") from.setUTCFullYear(from.getUTCFullYear() - 1);
  if (zoom === "month") from.setUTCMonth(from.getUTCMonth() - 3);
  if (zoom === "week") from.setUTCDate(from.getUTCDate() - 21);
  if (zoom === "day") from.setUTCDate(from.getUTCDate() - 2);
  return { from, to };
}

export function parseRange(params: {
  from?: string;
  to?: string;
  zoom: Zoom;
}): { from: Date; to: Date } {
  const fallback = defaultRangeForZoom(params.zoom);
  const from = params.from ? new Date(params.from) : fallback.from;
  const to = params.to ? new Date(params.to) : fallback.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return fallback;
  if (from > to) return { from: fallback.from, to: fallback.to };
  return { from, to };
}

export function toIso(d: Date): string {
  return d.toISOString();
}

export function bucketLabel(zoom: Zoom, isoDate: string): string {
  const d = new Date(isoDate);
  if (zoom === "year") {
    return `${d.getUTCFullYear()}`;
  }
  if (zoom === "month") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (zoom === "week") {
    // ISO week (UTC)
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Thursday in current week decides the year.
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    const weekYear = x.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const week = Math.ceil(((x.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${weekYear}-W${String(week).padStart(2, "0")}`;
  }
  // day
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const UTC_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatUtcTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const m = UTC_MONTHS_SHORT[d.getUTCMonth()] ?? "Jan";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  // Deterministic across SSR + client: never emits 24:xx.
  return `${m} ${dd}, ${yyyy}, ${hh}:${mm} UTC`;
}

