/**
 * Backfill cache headers for existing Supabase Storage objects referenced by entry_media.
 *
 * Why: older uploads defaulted to a short cache TTL which slows repeat views.
 * This script re-uploads each object to the same path with a long cacheControl.
 *
 * Notes:
 * - Supabase Storage doesn't currently support updating cacheControl without re-uploading.
 * - Bucket must be public if you want to check headers via HEAD; we still use service role for downloads/updates.
 *
 * Usage:
 *   node ./scripts/backfill-storage-cache.mjs --env-file .env.backfill.local
 *   node ./scripts/backfill-storage-cache.mjs --env-file .env.backfill.local --dry-run
 *   node ./scripts/backfill-storage-cache.mjs --env-file .env.backfill.local --limit 100
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

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

function loadEnv(envFile) {
  const cwd = process.cwd();
  if (envFile) {
    loadDotEnvFile(path.resolve(cwd, envFile));
    return;
  }
  loadDotEnvFile(path.join(cwd, ".env.local"));
  loadDotEnvFile(path.join(cwd, ".env"));
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

function encodePath(p) {
  return String(p ?? "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function parseMaxAge(cacheControl) {
  const s = String(cacheControl ?? "");
  const m = s.match(/max-age=(\d+)/i);
  return m?.[1] ? Number(m[1]) : null;
}

async function headCacheControl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status, cacheControl: null };
    return { ok: true, status: res.status, cacheControl: res.headers.get("cache-control") };
  } catch {
    return { ok: false, status: null, cacheControl: null };
  }
}

async function main() {
  const envFile = argValue("--env-file");
  loadEnv(envFile);

  const dryRun = hasFlag("--dry-run");
  const bucket = argValue("--bucket") ?? "timeline-media";
  const cacheSeconds = Number(argValue("--cache-seconds") ?? "31536000");
  const limit = argValue("--limit") ? Number(argValue("--limit")) : null;

  if (!Number.isFinite(cacheSeconds) || cacheSeconds <= 0) {
    throw new Error(`Invalid --cache-seconds: ${cacheSeconds}`);
  }

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const targetMaxAge = cacheSeconds;
  const publicBase = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/`;

  let processed = 0;
  let skippedAlreadyCached = 0;
  let updated = 0;
  let missing = 0;
  let failed = 0;

  // Pull referenced media; page in batches.
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data: rows, error } = await supabase
      .from("entry_media")
      .select("storage_path,mime_type,bytes")
      .eq("storage_bucket", bucket)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      if (limit && processed >= limit) break;
      processed += 1;

      const storagePath = row.storage_path;
      if (!storagePath) continue;

      if (processed % 100 === 0) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              dryRun,
              bucket,
              targetMaxAge,
              processed,
              skippedAlreadyCached,
              updated,
              missing,
              failed,
            },
            null,
            2,
          ),
        );
      }

      // Best-effort skip: if public headers already have a long max-age, don't touch it.
      const publicUrl = `${publicBase}${encodePath(storagePath)}`;
      const head = await headCacheControl(publicUrl);
      const currentMaxAge = head.cacheControl ? parseMaxAge(head.cacheControl) : null;
      if (currentMaxAge && currentMaxAge >= targetMaxAge) {
        skippedAlreadyCached += 1;
        continue;
      }

      if (dryRun) {
        updated += 1;
        continue;
      }

      try {
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(storagePath);
        if (dlErr) {
          missing += 1;
          continue;
        }
        const buf = Buffer.from(await blob.arrayBuffer());
        const contentType = row.mime_type ?? undefined;

        const { error: upErr } = await supabase.storage.from(bucket).update(storagePath, buf, {
          // Supabase expects seconds.
          cacheControl: String(targetMaxAge),
          contentType,
          upsert: true,
        });
        if (upErr) {
          failed += 1;
          continue;
        }

        updated += 1;
      } catch {
        failed += 1;
      }
    }

    if (limit && processed >= limit) break;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        bucket,
        targetMaxAge,
        processed,
        skippedAlreadyCached,
        updated,
        missing,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

