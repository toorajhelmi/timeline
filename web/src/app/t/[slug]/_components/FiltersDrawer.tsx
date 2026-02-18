"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import type { EntryType } from "../../../../lib/db/types";
import type { Zoom } from "../../../../lib/utils/time";

function zoomLabel(zoom: Zoom): string {
  if (zoom === "year") return "Year";
  if (zoom === "month") return "Month";
  if (zoom === "week") return "Week";
  return "Day";
}

export default function FiltersDrawer({
  slug,
  zoom,
  entryType,
  rangeLabel,
}: {
  slug: string;
  zoom: Zoom;
  entryType?: EntryType;
  rangeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedZoom, setSelectedZoom] = useState<Zoom>(zoom);
  const [selectedType, setSelectedType] = useState<EntryType | undefined>(entryType);

  // Keep in sync with server-rendered props after navigation.
  useEffect(() => {
    setSelectedZoom(zoom);
    setSelectedType(entryType);
  }, [zoom, entryType]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hrefFor = useMemo(() => {
    return (next: { z?: Zoom; type?: EntryType }) => {
      const params = new URLSearchParams();
      params.set("z", next.z ?? zoom);
      if (next.type) params.set("type", next.type);
      return `/t/${slug}?${params.toString()}`;
    };
  }, [slug, zoom]);

  function navigate(next: { z?: Zoom; type?: EntryType }) {
    const href = hrefFor(next);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <>
      {!open ? (
        <button
          type="button"
          className={[
            // Mobile: edge tab (doesn't cover bottom content / toolbars)
            "fixed right-0 top-1/2 z-[60] -translate-y-1/2",
            "inline-flex items-center gap-2",
            "rounded-l-2xl rounded-r-none border border-white/10",
            "bg-zinc-950/60 px-3 py-2 text-xs font-medium text-zinc-100 shadow-xl backdrop-blur-md hover:bg-zinc-950/70",
            // >=sm: bottom-right, safe-area aware
            "sm:right-[calc(1rem+env(safe-area-inset-right))] sm:top-auto sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:translate-y-0",
            "sm:rounded-2xl sm:px-0 sm:py-0",
          ].join(" ")}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open filters"
        >
          <span className="sr-only">Filters</span>
          <span className="inline-flex h-10 w-10 items-center justify-center text-base text-zinc-200 sm:text-lg">
            ≡
          </span>
        </button>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />

          <aside
            className={[
              "absolute z-50",
              "right-[calc(1rem+env(safe-area-inset-right))]",
              "top-[calc(6rem+env(safe-area-inset-top))]",
              "bottom-[calc(1rem+env(safe-area-inset-bottom))]",
              "w-[min(92vw,360px)]",
              "overflow-hidden rounded-2xl border border-white/10",
              "bg-zinc-950/60 text-zinc-100 shadow-2xl backdrop-blur-md",
            ].join(" ")}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between px-3 py-3">
                <div className="truncate text-sm font-semibold">Filters</div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-zinc-100 hover:bg-white/10"
                  onClick={() => setOpen(false)}
                  aria-label="Close filters"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    Zoom
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {(["year", "month", "week", "day"] as Zoom[]).map((z) => (
                      <button
                        key={z}
                        type="button"
                        className={[
                          "rounded-full border px-3 py-1",
                          z === selectedZoom
                            ? "border-white/30 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                        ].join(" ")}
                        onClick={() => {
                          setSelectedZoom(z);
                          navigate({ z, type: selectedType });
                        }}
                      >
                        {zoomLabel(z)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    Type
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      className={[
                        "rounded-full border px-3 py-1",
                        !selectedType
                          ? "border-white/30 bg-white/15 text-white"
                          : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                      ].join(" ")}
                      onClick={() => {
                        setSelectedType(undefined);
                        navigate({ z: selectedZoom });
                      }}
                    >
                      All
                    </button>
                    {(
                      [
                        "evidence",
                        "claim",
                        "call_to_action",
                      ] as EntryType[]
                    ).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={[
                          "rounded-full border px-3 py-1",
                          selectedType === t
                            ? "border-white/30 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                        ].join(" ")}
                        onClick={() => {
                          setSelectedType(t);
                          navigate({ z: selectedZoom, type: t });
                        }}
                      >
                        {t === "call_to_action"
                          ? "action"
                          : t === "claim"
                            ? "opinion"
                            : t === "evidence"
                              ? "moment"
                              : t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-zinc-300">{rangeLabel}</div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

