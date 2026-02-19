import type { EntryType } from "@/lib/db/types";

export type ShapeVariant = "rounded" | "octagon" | "diamond" | "oval" | "heart";

export function shapeForEntryType(type: EntryType): ShapeVariant {
  if (type === "update") return "rounded";
  if (type === "evidence") return "octagon";
  if (type === "claim") return "diamond";
  if (type === "context") return "oval";
  if (type === "call_to_action") return "rounded";
  return "heart";
}

export function clipPathForShape(shape: ShapeVariant): string | null {
  // Prefer `clip-path` to keep markup simple.
  if (shape === "rounded") return null;
  if (shape === "octagon")
    return "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";
  if (shape === "diamond") return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
  if (shape === "oval") return null; // handled via border radius
  // Heart via clip-path path() (supported in modern Chromium/WebKit).
  return "path('M 50 16 C 50 6 62 0 72 6 C 80 10 82 20 76 28 L 50 56 L 24 28 C 18 20 20 10 28 6 C 38 0 50 6 50 16 Z')";
}

export function gradientForEntryType(type: EntryType): string {
  if (type === "update") return "from-sky-500/25 via-indigo-500/10 to-transparent";
  if (type === "evidence") return "from-fuchsia-500/25 via-rose-500/10 to-transparent";
  if (type === "claim") return "from-amber-500/25 via-orange-500/10 to-transparent";
  if (type === "context") return "from-emerald-500/25 via-teal-500/10 to-transparent";
  if (type === "call_to_action") return "from-lime-500/25 via-cyan-500/10 to-transparent";
  return "from-violet-500/25 via-pink-500/10 to-transparent";
}

