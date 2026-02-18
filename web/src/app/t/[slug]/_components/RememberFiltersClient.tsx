"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

type Stored = { zoom?: string; type?: string; updatedAt?: number };

function safeParseJson(s: string | null): Stored | null {
  if (!s) return null;
  try {
    const j = JSON.parse(s) as Stored;
    if (!j || typeof j !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

export default function RememberFiltersClient({
  timelineSlug,
  userId,
  zoom,
  entryType,
}: {
  timelineSlug: string;
  userId: string | null;
  zoom: string;
  entryType?: string;
}) {
  const router = useRouter();
  const storageKey = useMemo(() => {
    const uid = userId ? userId : "anon";
    return `rekord:filters:${uid}:${timelineSlug}`;
  }, [timelineSlug, userId]);

  // Restore on mount if URL doesn't specify, using the last saved values.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const hasZoom = params.has("z");
      const hasType = params.has("type");
      if (hasZoom && hasType) return;

      const stored = safeParseJson(window.localStorage.getItem(storageKey));
      if (!stored) return;

      let changed = false;
      if (!hasZoom && stored.zoom) {
        params.set("z", stored.zoom);
        changed = true;
      }
      // Only restore type if we previously had one (empty means "All").
      if (!hasType && stored.type) {
        params.set("type", stored.type);
        changed = true;
      }

      if (!changed) return;

      const qs = params.toString();
      const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      router.replace(next, { scroll: false });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist whenever the server-driven props change.
  useEffect(() => {
    try {
      const payload: Stored = {
        zoom,
        type: entryType || "",
        updatedAt: Date.now(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [storageKey, zoom, entryType]);

  return null;
}

