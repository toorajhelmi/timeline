"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function EntryMediaLiveRefreshClient({ entryId }: { entryId: string }) {
  const router = useRouter();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const onMedia = (ev: Event) => {
      try {
        const e = ev as CustomEvent<any>;
        const d = e.detail ?? {};
        if (d.entryId !== entryId) return;

        // Avoid spamming refresh during chunked uploads; refresh at most once every ~1.2s.
        const now = Date.now();
        if (now - lastRefreshAt.current < 1200) return;
        lastRefreshAt.current = now;
        router.refresh();
      } catch {
        // ignore
      }
    };

    window.addEventListener("rekord:media", onMedia as any);
    return () => window.removeEventListener("rekord:media", onMedia as any);
  }, [entryId, router]);

  return null;
}

