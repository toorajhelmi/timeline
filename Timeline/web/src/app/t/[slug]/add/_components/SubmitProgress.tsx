"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

function RekordMark() {
  return (
    <div className="relative grid place-items-center">
      <div className="absolute h-16 w-16 animate-spin rounded-full border-2 border-white/10 border-t-white/70" />
      <div className="absolute h-24 w-24 animate-[spin_2.8s_linear_infinite] rounded-full border border-white/10 border-t-emerald-300/60 blur-[0.2px]" />
      <div className="relative select-none text-2xl font-semibold tracking-[0.18em] text-white/90">
        REKORD
      </div>
    </div>
  );
}

function ProgressOverlay({ visible }: { visible: boolean }) {
  const [show, setShow] = useState(false);

  // Avoid flicker for very fast submissions.
  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), 120);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/55 px-6 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Posting entry"
    >
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950/70 p-6 shadow-2xl">
        <RekordMark />
        <div className="mt-5 text-center text-sm text-zinc-200">
          Posting…
          <div className="mt-1 text-xs text-zinc-400">
            Uploading media can take a moment. Please keep this tab open.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubmitProgress({
  idleLabel = "Publish entry",
  pendingLabel = "Posting…",
}: {
  idleLabel?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <ProgressOverlay visible={pending} />
      <button
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pending}
        aria-disabled={pending}
        type="submit"
      >
        {pending ? pendingLabel : idleLabel}
      </button>
    </>
  );
}

