"use client";

import { usePathname } from "next/navigation";

export default function HeaderShellClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  const isTimeline = pathname.startsWith("/t/");

  // Home: sticky + pure black (no theme bleed).
  if (isHome) {
    return (
      <header className="sticky top-0 z-[200] border-b border-zinc-800 bg-black text-zinc-50">
        {children}
      </header>
    );
  }

  // Timeline pages: allow theme-driven gradient using CSS variables.
  if (isTimeline) {
    return (
      <header className="relative overflow-hidden border-b border-zinc-800 bg-zinc-950 text-zinc-50">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_10%,color-mix(in_oklab,var(--tl-secondary,#22c55e)_38%,transparent)_0%,transparent_62%)] opacity-45" />
          <div className="absolute inset-0 bg-[radial-gradient(760px_360px_at_90%_0%,color-mix(in_oklab,var(--tl-secondary,#ef4444)_28%,transparent)_0%,transparent_62%)] opacity-35" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--tl-primary,#0b1220)_22%,transparent)_0%,color-mix(in_oklab,var(--tl-primary,#0b1220)_12%,transparent)_55%,transparent_100%)] opacity-80" />
          <div className="absolute inset-0 bg-[conic-gradient(from_220deg_at_50%_50%,transparent_0deg,color-mix(in_oklab,var(--tl-secondary,#22c55e)_18%,transparent)_70deg,transparent_160deg,color-mix(in_oklab,var(--tl-text,#f8fafc)_12%,transparent)_220deg,transparent_360deg)] opacity-25 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/25" />
        </div>
        {children}
      </header>
    );
  }

  // Everything else: neutral header.
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 text-zinc-50">
      {children}
    </header>
  );
}
