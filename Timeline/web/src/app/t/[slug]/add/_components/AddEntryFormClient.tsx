"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { EntryType } from "../../../../../lib/db/types";
import { createSupabaseBrowserClient } from "../../../../../lib/supabase/browser";
import { useUploadQueue } from "../../../../_components/UploadQueueClient";
import EntryTypePicker from "./EntryTypePicker";
import MediaPicker, { type PickedFile } from "./MediaPicker";
import TimeRangePicker from "./TimeRangePicker";

type Phase = "idle" | "creating" | "queued" | "error";

function PinkK({ text }: { text: string }) {
  const idx = text.indexOf("K");
  if (idx === -1) return <span>{text}</span>;
  return (
    <span className="font-black tracking-[0.2em]">
      {text.slice(0, idx)}
      <span className="text-pink-400">{text[idx]}</span>
      {text.slice(idx + 1)}
    </span>
  );
}

function clampEntryType(t?: string): EntryType {
  if (t === "evidence" || t === "claim" || t === "call_to_action") return t;
  return "claim";
}

function extFromName(name: string): string {
  const n = String(name ?? "");
  const i = n.lastIndexOf(".");
  if (i === -1) return "";
  const e = n.slice(i).slice(0, 12);
  return /^[\.\w-]+$/.test(e) ? e : "";
}

function kindFromMime(mime: string) {
  const m = String(mime ?? "");
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

export default function AddEntryFormClient({
  timelineId,
  timelineSlug,
}: {
  timelineId: string;
  timelineSlug: string;
}) {
  const router = useRouter();
  const { enqueue, setMinimized } = useUploadQueue();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedFile[]>([]);

  const originalsCount = useMemo(
    () => picked.filter((p) => p.role === "original").length,
    [picked],
  );

  return (
    <div className="relative">
      {(phase === "creating" || phase === "queued") && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-6 backdrop-blur">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950/80 p-6 text-center text-zinc-100 shadow-2xl">
            <div className="text-2xl font-black tracking-[0.2em]">
              <PinkK text="reKord" />
            </div>
            <div className="mt-3 text-sm text-zinc-200">
              {phase === "creating" ? "Publishing…" : "Uploading media…"}
            </div>
            <div className="mt-2 text-xs text-zinc-400">
              {originalsCount ? `${originalsCount} file${originalsCount === 1 ? "" : "s"} queued` : ""}
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-white/25" />
            </div>
            <div className="mt-4 text-[11px] text-zinc-400">
              You can keep using the app while uploads continue.
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="mt-6 rounded-xl border border-rose-900/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          Create failed: <span className="font-medium">{error}</span>
        </div>
      ) : null}

      <form
        className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);

          const form = e.currentTarget;
          const fd = new FormData(form);

          const type = clampEntryType(String(fd.get("type") ?? ""));
          const title = String(fd.get("title") ?? "").trim();
          const body = String(fd.get("body") ?? "").trim();
          const sourceUrl = String(fd.get("source_url") ?? "").trim();
          const timeStartUtc = String(fd.get("time_start_utc") ?? "").trim();
          const timeEndUtc = String(fd.get("time_end_utc") ?? "").trim();

          if (!body) {
            setError("missing_body");
            return;
          }

          // Moment requires either a source URL or at least one media upload.
          if (type === "evidence" && !sourceUrl && picked.length === 0) {
            setError("moment_needs_source_or_media");
            return;
          }

          const startDate = new Date(timeStartUtc || String(fd.get("time_start") ?? ""));
          if (Number.isNaN(startDate.getTime())) {
            setError("invalid_time_start");
            return;
          }
          const endDate = timeEndUtc ? new Date(timeEndUtc) : null;
          if (endDate && Number.isNaN(endDate.getTime())) {
            setError("invalid_time_end");
            return;
          }

          setPhase("creating");

          try {
            const supabase = createSupabaseBrowserClient();
            const { data: userData, error: uErr } = await supabase.auth.getUser();
            if (uErr) throw uErr;
            if (!userData.user) throw new Error("not_signed_in");

            const { data: entry, error: eErr } = await supabase
              .from("entries")
              .insert({
                timeline_id: timelineId,
                type,
                title: title || null,
                body,
                time_start: startDate.toISOString(),
                time_end: endDate ? endDate.toISOString() : null,
                corrects_entry_id: null,
                created_by: userData.user.id,
              } as any)
              .select("id")
              .single();
            if (eErr) throw eErr;

            const entryId = entry.id as string;

            if (sourceUrl) {
              const { error: sErr } = await supabase.from("sources").insert({
                entry_id: entryId,
                url: sourceUrl,
                source_type: "web",
                added_by: userData.user.id,
              } as any);
              if (sErr) throw sErr;
            }

            if (picked.length === 0) {
              setPhase("idle");
              router.replace(`/t/${timelineSlug}/e/${entryId}`);
              router.refresh();
              return;
            }

            // Queue uploads globally (continues across navigation).
            setPhase("queued");
            setMinimized(false);

            const bucket = "timeline-media";
            for (const pf of picked) {
              const f = pf.file;
              if (!f || !f.size) continue;
              const mime = f.type || "application/octet-stream";
              const kind = kindFromMime(mime);
              const variant = kind === "video" ? "original" : "original";
              const ext = extFromName(f.name);
              const objectPath = `${timelineSlug}/${entryId}/${crypto.randomUUID()}${ext}`;

              enqueue({
                timelineSlug,
                entryId,
                file: f,
                storageBucket: bucket,
                storagePath: objectPath,
                kind,
                variant,
              });
            }

            // Replace history entry so Back goes to timeline, not /add.
            router.replace(`/t/${timelineSlug}/e/${entryId}`);
            router.refresh();

            // Let the overlay breathe very briefly, then release.
            window.setTimeout(() => setPhase("idle"), 900);
          } catch (err: any) {
            setError(String(err?.message ?? err ?? "unknown_error"));
            setPhase("idle");
          }
        }}
      >
        <label className="text-sm font-medium">Type</label>
        <div id="type">
          <EntryTypePicker name="type" defaultValue="claim" />
        </div>

        <label className="mt-5 block text-sm font-medium" htmlFor="title">
          Title (optional)
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="title"
          name="title"
          placeholder="Short headline"
          dir="auto"
        />

        <label className="mt-5 block text-sm font-medium" htmlFor="body">
          Body
        </label>
        <textarea
          className="mt-2 w-full resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="body"
          name="body"
          placeholder="What happened? Add context and keep it clear."
          rows={6}
          required
          dir="auto"
        />

        <TimeRangePicker />

        <label className="mt-5 block text-sm font-medium" htmlFor="source_url">
          Source URL (optional · Moment needs source OR media)
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:focus:ring-zinc-600"
          id="source_url"
          name="source_url"
          placeholder="https://…"
          type="url"
        />

        <div className="mt-5">
          <label className="text-sm font-medium">Media (optional)</label>
          <div className="mt-1 text-xs text-zinc-400">
            Choose images, video, or audio.
          </div>
          <MediaPicker accept="image/*,video/*,audio/*" onPickedChange={setPicked} />
        </div>

        <button
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={phase !== "idle"}
          type="submit"
        >
          {phase === "idle" ? "Publish entry" : "Publishing…"}
        </button>
      </form>
    </div>
  );
}

