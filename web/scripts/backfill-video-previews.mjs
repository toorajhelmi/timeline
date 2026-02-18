/**
 * Backfill low-res "preview" videos for timeline cards.
 *
 * Strategy:
 * - Find entry_media rows where kind='video' and variant='original'
 * - For each, download the original video
 * - Use local ffmpeg to generate a small webm preview (first 6s, 480w, no audio)
 * - Upload to the same bucket under `${dir}/__preview__${base}.webm`
 * - Insert a new entry_media row with variant='preview'
 *
 * Requirements:
 * - ffmpeg must be installed and available on PATH
 * - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env file
 *
 * Usage:
 *   node ./scripts/backfill-video-previews.mjs --env-file .env.backfill.local
 *   node ./scripts/backfill-video-previews.mjs --env-file .env.backfill.local --dry-run --limit 10
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function loadDotEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (!key) continue;
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ok
  }
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requireEnv(name, fallbacks = []) {
  const candidates = [name, ...fallbacks];
  const v = candidates.map((k) => process.env[k]).find(Boolean);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function ensureFfmpeg() {
  const res = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (res.status !== 0) {
    throw new Error("ffmpeg not found on PATH. Install ffmpeg to run this script.");
  }
}

function previewPathFor(storagePath) {
  const dir = storagePath.includes("/") ? storagePath.split("/").slice(0, -1).join("/") : "";
  const base = storagePath.split("/").pop() ?? storagePath;
  const safeBase = base.replace(/\.[^.]+$/, "");
  const p = `__preview__${safeBase}.webm`;
  return dir ? `${dir}/${p}` : p;
}

async function main() {
  const envFile = argValue("--env-file") ?? ".env.backfill.local";
  loadDotEnvFile(path.resolve(process.cwd(), envFile));

  const dryRun = hasFlag("--dry-run");
  const limit = argValue("--limit") ? Number(argValue("--limit")) : null;
  const bucket = argValue("--bucket") ?? "timeline-media";

  ensureFfmpeg();

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let processed = 0;
  let created = 0;
  let skippedHasPreview = 0;
  let failed = 0;

  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data: rows, error } = await supabase
      .from("entry_media")
      .select("id,entry_id,kind,variant,storage_bucket,storage_path,mime_type,uploaded_by")
      .eq("storage_bucket", bucket)
      .eq("kind", "video")
      .eq("variant", "original")
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      if (limit && processed >= limit) break;
      processed += 1;

      const previewPath = previewPathFor(r.storage_path);

      // Skip if preview already exists in DB
      const { data: existingPreview } = await supabase
        .from("entry_media")
        .select("id")
        .eq("entry_id", r.entry_id)
        .eq("kind", "video")
        .eq("variant", "preview")
        .eq("storage_path", previewPath)
        .maybeSingle();
      if (existingPreview?.id) {
        skippedHasPreview += 1;
        continue;
      }

      if (dryRun) {
        created += 1;
        continue;
      }

      try {
        console.log(`preview: ${r.storage_path}`);
        const { data: blob, error: dlErr } = await supabase.storage
          .from(bucket)
          .download(r.storage_path);
        if (dlErr) throw dlErr;
        const inBuf = Buffer.from(await blob.arrayBuffer());

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rekord-preview-"));
        const inFile = path.join(tmpDir, "in");
        const outFile = path.join(tmpDir, "out.webm");
        fs.writeFileSync(inFile, inBuf);

        const ff = spawnSync(
          "ffmpeg",
          [
            "-y",
            "-i",
            inFile,
            "-ss",
            "0",
            "-t",
            "6",
            "-an",
            "-vf",
            "scale=480:-2,fps=12",
            "-c:v",
            "libvpx-vp9",
            "-b:v",
            "0",
            "-crf",
            "40",
            "-deadline",
            "realtime",
            "-cpu-used",
            "8",
            "-row-mt",
            "1",
            outFile,
          ],
          { stdio: "ignore", timeout: 120_000 },
        );
        if (ff.status !== 0) throw new Error("ffmpeg_failed");

        const outBuf = fs.readFileSync(outFile);

        const { error: upErr } = await supabase.storage.from(bucket).upload(previewPath, outBuf, {
          contentType: "video/webm",
          cacheControl: "31536000",
          upsert: true,
        });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from("entry_media").insert({
          entry_id: r.entry_id,
          kind: "video",
          storage_bucket: bucket,
          storage_path: previewPath,
          variant: "preview",
          original_url: null,
          mime_type: "video/webm",
          bytes: outBuf.length,
          uploaded_by: r.uploaded_by,
        });
        if (insErr) throw insErr;

        created += 1;
      } catch (e) {
        failed += 1;
        console.warn(`WARN: preview failed for ${r.storage_path}: ${String(e?.message ?? e)}`);
      }

      if (processed % 25 === 0) {
        console.log(JSON.stringify({ ok: true, dryRun, processed, created, skippedHasPreview, failed }, null, 2));
      }
    }

    if (limit && processed >= limit) break;
  }

  console.log(JSON.stringify({ ok: true, dryRun, processed, created, skippedHasPreview, failed }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

