export function getSiteUrl(): string {
  const explicit =
    (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Vercel provides the hostname without scheme.
  const vercel = (process.env.VERCEL_URL ?? "").trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  // Local dev fallback.
  return "http://localhost:3000";
}

