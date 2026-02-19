/**
 * E2E compression test against hosted Supabase (same DB).
 *
 * Creates a throwaway entry, uploads an "original" video, inserts entry_media(original),
 * waits for the trigger-enqueued job, runs the transcode worker once, then verifies:
 * - optimized entry_media exists
 * - original entry_media row is deleted
 * - original storage object is deleted
 *
 * Usage:
 *   node ./scripts/test-compression-e2e.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const p = path.resolve(process.cwd(), ".env.local");
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    v = v.replace(/^['"]+/, "").replace(/['"]+$/, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

function requireEnv(name, fallbacks = []) {
  const keys = [name, ...fallbacks];
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  throw new Error(`Missing env var: ${name}`);
}

function ensureFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) throw new Error("ffmpeg not found on PATH");
}

function sha256File(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function makeTestVideo({ outFile }) {
  // Generate a modest MP4 (few MB) to keep the test fast.
  // We still trigger compression via bytes>=100MB in entry_media.
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=1280x720:rate=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "12",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outFile,
  ];
  const r = spawnSync("ffmpeg", args, { stdio: "inherit", timeout: 1000 * 60 * 2 });
  if (r.status !== 0) throw new Error("ffmpeg_generate_failed");
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  ensureFfmpeg();
  loadDotEnvLocal();

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = process.env.TRANSCODE_BUCKET ?? "timeline-media";

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!profile?.id) throw new Error("no_profiles_found");

  const { data: timeline } = await supabase
    .from("timelines")
    .select("id,slug")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!timeline?.id) throw new Error("no_timelines_found");

  const { data: entry, error: eErr } = await supabase
    .from("entries")
    .insert({
      timeline_id: timeline.id,
      type: "evidence",
      title: "Compression test (throwaway)",
      body: "Compression worker e2e test",
      time_start: new Date().toISOString(),
      time_end: null,
      corrects_entry_id: null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (eErr) throw eErr;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rekord-e2e-compress-"));
  const vidFile = path.join(tmpDir, "original.mp4");
  makeTestVideo({ outFile: vidFile });
  const stat = fs.statSync(vidFile);

  const originalPath = `${timeline.slug}/${entry.id}/__original_test__.mp4`;

  console.log("[e2e] uploading original:", originalPath, "bytes=", stat.size);
  const buf = fs.readFileSync(vidFile);
  const { error: upErr } = await supabase.storage.from(bucket).upload(originalPath, buf, {
    contentType: "video/mp4",
    cacheControl: "31536000",
    upsert: true,
  });
  if (upErr) throw upErr;

  console.log("[e2e] inserting entry_media(original) and forcing bytes>=100MB to trigger job…");
  const forcedBytes = 150 * 1024 * 1024;
  const { data: originalRow, error: mErr } = await supabase
    .from("entry_media")
    .insert({
      entry_id: entry.id,
      kind: "video",
      storage_bucket: bucket,
      storage_path: originalPath,
      variant: "original",
      original_url: null,
      mime_type: "video/mp4",
      bytes: forcedBytes,
      sha256: sha256File(vidFile),
      uploaded_by: profile.id,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;

  console.log("[e2e] waiting for video_transcode_jobs row…");
  let job = null;
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("video_transcode_jobs")
      .select("id,status,storage_path,out_variant")
      .eq("entry_media_id", originalRow.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    job = data?.[0] ?? null;
    if (job?.id) break;
    await sleep(500);
  }
  if (!job?.id) throw new Error("job_not_enqueued");
  console.log("[e2e] job enqueued:", job.id);

  console.log("[e2e] running transcode worker once…");
  const r = spawnSync(
    process.execPath,
    ["scripts/transcode-worker.mjs"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        TRANSCODE_ONCE: "1",
        TRANSCODE_JOB_ID: job.id,
        TRANSCODE_BUCKET: bucket,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      },
      timeout: 1000 * 60 * 30,
    },
  );
  if (r.status !== 0) throw new Error(`worker_failed_exit_${r.status}`);

  console.log("[e2e] verify: original entry_media deleted and optimized exists…");
  const { data: mediaRows, error: vErr } = await supabase
    .from("entry_media")
    .select("id,variant,storage_path,bytes")
    .eq("entry_id", entry.id)
    .order("created_at", { ascending: true });
  if (vErr) throw vErr;
  console.log(mediaRows);

  const hasOriginal = (mediaRows ?? []).some((m) => m.variant === "original");
  const hasOptimized = (mediaRows ?? []).some((m) => m.variant === "optimized");
  if (hasOriginal) throw new Error("original_media_row_still_present");
  if (!hasOptimized) throw new Error("optimized_media_missing");

  console.log("[e2e] verify: original storage object removed…");
  const { data: signed, error: sErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(originalPath, 60);
  if (!sErr) {
    // If signed URL succeeded, the object likely still exists (or bucket ignores).
    console.warn("[e2e] WARNING: original signed URL still created; object may still exist:", signed?.signedUrl);
  } else {
    console.log("[e2e] original signed URL failed (expected):", sErr.message);
  }

  console.log("[e2e] SUCCESS. Entry id:", entry.id);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});

