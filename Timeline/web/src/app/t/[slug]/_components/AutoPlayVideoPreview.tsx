"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function isNearViewportCenter(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const vx = window.innerWidth / 2;
  const dx = Math.abs(cx - vx);
  return dx < window.innerWidth * 0.22; // within ~22% of center
}

export default function AutoPlayVideoPreview({
  videoUrl,
  posterUrl,
  heightClassName,
}: {
  videoUrl: string;
  posterUrl?: string;
  heightClassName: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldPlay, setShouldPlay] = useState(false);

  const canAutoPlay = useMemo(() => !prefersReducedMotion(), []);

  useEffect(() => {
    if (!canAutoPlay) return;
    const node = ref.current;
    if (!node) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        const target = e?.target as HTMLElement | undefined;
        if (!target) return;
        const visibleEnough = (e.intersectionRatio ?? 0) >= 0.65;
        setShouldPlay(visibleEnough && isNearViewportCenter(target));
      },
      { threshold: [0, 0.25, 0.5, 0.65, 0.8, 1] },
    );

    obs.observe(node);
    return () => obs.disconnect();
  }, [canAutoPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!canAutoPlay) return;

    if (shouldPlay) {
      // muted + playsInline should allow autoplay
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [shouldPlay, canAutoPlay]);

  return (
    <div ref={ref} className={`relative w-full ${heightClassName}`}>
      {/* poster layer */}
      {posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="video poster"
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          src={posterUrl}
          loading="lazy"
        />
      ) : null}

      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src={videoUrl}
        muted
        playsInline
        loop
        preload="metadata"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-900">
          ▶
        </span>
        <span className="text-xs font-medium text-white/90">Video</span>
      </div>
    </div>
  );
}

