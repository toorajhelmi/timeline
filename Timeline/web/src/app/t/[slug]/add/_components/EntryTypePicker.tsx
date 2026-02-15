"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type EntryTypeValue = "evidence" | "claim" | "call_to_action";

type Opt = { value: EntryTypeValue; label: string; hint?: string };

const OPTIONS: Opt[] = [
  { value: "evidence", label: "Moment", hint: "Source or media required" },
  { value: "claim", label: "Opinion", hint: "A clear statement" },
  { value: "call_to_action", label: "Call to action", hint: "What should happen next" },
];

export default function EntryTypePicker({
  name,
  defaultValue = "claim",
}: {
  name: string;
  defaultValue?: EntryTypeValue;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<EntryTypeValue>(defaultValue);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const selected = useMemo(
    () => OPTIONS.find((o) => o.value === value) ?? OPTIONS[1]!,
    [value],
  );

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (!open) return;
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        ref={buttonRef}
        type="button"
        className="mt-2 flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:text-zinc-100 dark:focus:ring-zinc-600"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          {/* Only show the main label (no hint) in the closed state */}
          <span className="font-medium">{selected.label}</span>
        </span>
        <span className="text-zinc-500 dark:text-zinc-400" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 text-sm text-zinc-100 shadow-2xl backdrop-blur"
          role="listbox"
          aria-label="Entry type"
        >
          {OPTIONS.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                }`}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setValue(o.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{o.label}</span>
                  {o.hint ? <span className="block text-xs text-zinc-400">{o.hint}</span> : null}
                </span>
                <span className="mt-0.5 text-xs text-zinc-400" aria-hidden>
                  {active ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

