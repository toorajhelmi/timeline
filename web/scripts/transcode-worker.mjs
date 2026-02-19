/**
 * Background worker: transcode large original videos into an "optimized" variant.
 *
 * Host: Railway (Docker) with ffmpeg installed.
 *
 * Env:
 * - SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TRANSCODE_BUCKET (default: timeline-media)
 * - TRANSCODE_POLL_MS (default: 4000)
 * - WORKER_ID (optional)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";

import { createClient } from "@supabase/supabase-js";

function env(name, fallback = null) {
  return process.env[name] ?? fallback;
}

function requireEnv(name, fallbacks = []) {
  const candidates = [name, ...fallbacks];
  for (const k of candidates) {
    const v = process.env[k];
    if (v) return v;
  }
  throw new Error(`Missing env var: ${name}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureFfmpeg() {
  const res = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (res.status !== 0) throw new Error("ffmpeg not found on PATH");
}

function optimizedPathFor(storagePath) {
  const dir = storagePath.includes("/") ? storagePath.split("/").slice(0, -1).join("/") : "";
  const base = storagePath.split("/").pop() ?? storagePath;
  const safe = base.replace(/\.[^.]+$/, "");
  const out = `__optimized__${safe}.mp4`;
  return dir ? `${dir}/${out}` : out;
}

async function cleanupOriginal({ supabase, job }) {
  // Delete the original storage object + DB row once optimized exists.
  const { error: rmErr } = await supabase.storage
    .from(job.storage_bucket)
    .remove([job.storage_path]);
  if (rmErr) throw rmErr;

  // Delete the original entry_media row (keep preview/poster/optimized).
  const { error: delErr } = await supabase
    .from("entry_media")
    .delete()
    .eq("id", job.entry_media_id);
  if (delErr) throw delErr;
}

async function streamToFile(url, outFile) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download_failed_${res.status}`);
  const ws = fs.createWriteStream(outFile);
  const rs = Readable.fromWeb(res.body);
  await new Promise((resolve, reject) => {
    rs.pipe(ws);
    rs.on("error", reject);
    ws.on("error", reject);
    ws.on("finish", resolve);
  });
}

async function uploadFileToStorage({ supabaseUrl, serviceKey, bucket, objectPath, filePath }) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const body = Readable.toWeb(fs.createReadStream(filePath));
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "x-upsert": "true",
      "content-type": "video/mp4",
      cacheControl: "31536000",
    },
    // Node requires duplex for streaming request bodies.
    duplex: "half",
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`upload_failed_${res.status}:${t.slice(0, 200)}`);
  }
}

function runFfmpeg({ inFile, outFile }) {
  // Reasonable, fast “timeline playback” variant:
  // - 720p max width
  // - H.264 + AAC
  // - capped bitrate to keep file size sane
  const args = [
    "-y",
    "-i",
    inFile,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-maxrate",
    "2500k",
    "-bufsize",
    "5000k",
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
  const r = spawnSync("ffmpeg", args, { stdio: "inherit", timeout: 1000 * 60 * 90 });
  if (r.status !== 0) throw new Error("ffmpeg_failed");
}

async function main() {
  ensureFfmpeg();

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = env("TRANSCODE_BUCKET", "timeline-media");
  const pollMs = Number(env("TRANSCODE_POLL_MS", "4000"));
  const workerId = env("WORKER_ID", `railway-${process.pid}-${Math.random().toString(16).slice(2)}`);
  const once = env("TRANSCODE_ONCE", "0") === "1";
  const jobId = env("TRANSCODE_JOB_ID", null);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // eslint-disable-next-line no-console
  console.log(`[transcode-worker] start workerId=${workerId} pollMs=${pollMs}`);

  while (true) {
    let job = null;
    try {
      if (jobId) {
        // Test mode: process a specific job id only (avoid touching other queued jobs).
        const { error: lockErr } = await supabase
          .from("video_transcode_jobs")
          .update({
            status: "processing",
            locked_at: new Date().toISOString(),
            locked_by: workerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .in("status", ["queued", "processing"]);
        if (lockErr) throw lockErr;

        const { data: rows, error: selErr } = await supabase
          .from("video_transcode_jobs")
          .select("*")
          .eq("id", jobId)
          .limit(1);
        if (selErr) throw selErr;
        job = rows?.[0] ?? null;
      } else {
        const { data, error } = await supabase.rpc("claim_video_transcode_job", {
          p_worker_id: workerId,
        });
        if (error) throw error;
        job = Array.isArray(data) ? data[0] ?? null : data ?? null;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[transcode-worker] claim failed:", String(e?.message ?? e));
      await sleep(Math.min(30_000, pollMs * 3));
      continue;
    }

    if (!job?.id) {
      if (jobId) return;
      await sleep(pollMs);
      continue;
    }

    const outPath = optimizedPathFor(job.storage_path);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rekord-tx-"));
    const inFile = path.join(tmpDir, "in");
    const outFile = path.join(tmpDir, "out.mp4");

    try {
      // If optimized already exists, just cleanup original and mark done.
      const { data: existing } = await supabase
        .from("entry_media")
        .select("id")
        .eq("entry_id", job.entry_id)
        .eq("kind", "video")
        .eq("variant", "optimized")
        .eq("storage_bucket", job.storage_bucket)
        .eq("storage_path", outPath)
        .maybeSingle();
      if (existing?.id) {
        await cleanupOriginal({ supabase, job });
        await supabase
          .from("video_transcode_jobs")
          .update({
            status: "done",
            out_storage_path: outPath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        continue;
      }

      const { data: signed, error: sErr } = await supabase.storage
        .from(job.storage_bucket)
        .createSignedUrl(job.storage_path, 60 * 60);
      if (sErr) throw sErr;
      const signedUrl = signed?.signedUrl;
      if (!signedUrl) throw new Error("missing_signed_url");

      // eslint-disable-next-line no-console
      console.log(`[transcode-worker] job=${job.id} download ${job.storage_path}`);
      await streamToFile(signedUrl, inFile);

      // eslint-disable-next-line no-console
      console.log(`[transcode-worker] job=${job.id} ffmpeg -> ${outPath}`);
      runFfmpeg({ inFile, outFile });

      const outStat = fs.statSync(outFile);

      // eslint-disable-next-line no-console
      console.log(`[transcode-worker] job=${job.id} upload bytes=${outStat.size}`);
      await uploadFileToStorage({
        supabaseUrl,
        serviceKey,
        bucket: job.storage_bucket,
        objectPath: outPath,
        filePath: outFile,
      });

      await supabase.from("entry_media").insert({
        entry_id: job.entry_id,
        kind: "video",
        storage_bucket: job.storage_bucket,
        storage_path: outPath,
        variant: "optimized",
        original_url: null,
        mime_type: "video/mp4",
        bytes: outStat.size,
        uploaded_by: job.uploaded_by,
      });

      // Delete original only after optimized is written.
      await cleanupOriginal({ supabase, job });

      await supabase
        .from("video_transcode_jobs")
        .update({
          status: "done",
          out_storage_path: outPath,
          out_bytes: outStat.size,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (once || jobId) {
        // eslint-disable-next-line no-console
        console.log("[transcode-worker] exiting after success");
        return;
      }
    } catch (e) {
      const msg = String(e?.message ?? e ?? "error");
      // eslint-disable-next-line no-console
      console.error(`[transcode-worker] job=${job.id} failed:`, msg);
      await supabase
        .from("video_transcode_jobs")
        .update({
          status: "queued",
          last_error: msg,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[transcode-worker] fatal:", e);
  process.exit(1);
});

