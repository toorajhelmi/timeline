export type Zoom = "year" | "month" | "week" | "day";

export function clampZoom(z?: string): Zoom {
  if (z === "year" || z === "month" || z === "week" || z === "day") return z;
  return "month";
}

export function defaultRangeForZoom(zoom: Zoom): { from: Date; to: Date } {
  const to = new Date();
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
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (zoom === "month") {
    // Year-WeekNumber (rough, but stable enough for v0)
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
    const week = Math.floor(days / 7) + 1;
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  if (zoom === "week") {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:00Z`;
}

