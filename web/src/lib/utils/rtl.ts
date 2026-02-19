const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function isProbablyRtl(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  return ARABIC_SCRIPT_RE.test(t);
}

