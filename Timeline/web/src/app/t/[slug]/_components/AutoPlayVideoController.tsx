"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

function computeShouldPlay(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const inViewport =
    rect.right > 0 &&
    rect.left < window.innerWidth &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight;
  if (!inViewport) return false;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = Math.abs(cx - window.innerWidth / 2);
  const dy = Math.abs(cy - window.innerHeight / 2);

  return dx < window.innerWidth * 0.22 && dy < window.innerHeight * 0.35;
}

export default function AutoPlayVideoController({
  targetId,
}: {
  targetId: string;
}) {
  const [active, setActive] = useState(false);
  const raf = useRef<number | null>(null);

  const canAutoPlay = useMemo(() => {
    if (typeof window === "undefined") return false;
    return !prefersReducedMotion();
  }, []);

  useEffect(() => {
    if (!canAutoPlay) return;

    const el = document.getElementById(targetId) as HTMLElement | null;
    if (!el) return;
    const video = el.querySelector("video") as HTMLVideoElement | null;
    if (!video) return;

    const schedule = () => {
      if (raf.current != null) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        setActive(computeShouldPlay(el));
      });
    };

    const scrollParent = el.closest("[data-timeline-scroll]") as HTMLElement | null;

    const obs = new IntersectionObserver(() => schedule(), {
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    obs.observe(el);

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    scrollParent?.addEventListener("scroll", schedule, { passive: true });

    schedule();

    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      scrollParent?.removeEventListener("scroll", schedule);
      if (raf.current != null) {
        window.cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [canAutoPlay, targetId]);

  useEffect(() => {
    if (!canAutoPlay) return;
    const el = document.getElementById(targetId) as HTMLElement | null;
    const video = el?.querySelector("video") as HTMLVideoElement | null;
    if (!video) return;

    if (active) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, canAutoPlay, targetId]);

  return null;
}

