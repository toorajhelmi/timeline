/**
 * Delete all entries (and their sources/media) for a timeline slug.
 * Also removes corresponding Storage objects referenced by entry_media.
 *
 * Usage:
 *   node ./scripts/delete-timeline-data.mjs --timeline-slug iran-uprise-2026 --dry-run
 *   node ./scripts/delete-timeline-data.mjs --timeline-slug iran-uprise-2026
 *
 * Notes:
 * - Requires SUPABASE_SERVICE_ROLE_KEY (service role) to bypass RLS.
 * - DB FKs cascade delete sources/entry_media/comments/etc, but Storage objects
 *   must be removed explicitly.
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

function loadLocalEnv() {
  const cwd = process.cwd();
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

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  loadLocalEnv();

  const timelineSlug = argValue("--timeline-slug");
  if (!timelineSlug) throw new Error("Missing --timeline-slug");
  const dryRun = hasFlag("--dry-run");

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tl, error: tErr } = await supabase
    .from("timelines")
    .select("id,slug")
    .eq("slug", timelineSlug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tl) throw new Error(`timeline not found: ${timelineSlug}`);

  // Fetch entry ids in pages
  const entryIds = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("entries")
      .select("id")
      .eq("timeline_id", tl.id)
      .range(offset, offset + 999);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id);
    entryIds.push(...ids);
    if (ids.length < 1000) break;
  }

  let mediaRows = [];
  if (entryIds.length) {
    // entry_media might be large; fetch in chunks
    for (const ids of chunk(entryIds, 500)) {
      const { data, error } = await supabase
        .from("entry_media")
        .select("id,kind,storage_bucket,storage_path")
        .in("entry_id", ids);
      if (error) throw error;
      mediaRows.push(...(data ?? []));
    }
  }

  const byBucket = new Map();
  for (const m of mediaRows) {
    const b = m.storage_bucket;
    const list = byBucket.get(b) ?? [];
    list.push(m.storage_path);
    byBucket.set(b, list);
  }

  const plan = {
    timeline: tl.slug,
    entries: entryIds.length,
    entry_media: mediaRows.length,
    storage: Array.from(byBucket.entries()).map(([bucket, paths]) => ({
      bucket,
      objects: paths.length,
    })),
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
    return;
  }

  // Remove storage objects first (so we don't lose paths after cascade delete)
  for (const [bucket, paths] of byBucket.entries()) {
    for (const batch of chunk(paths, 100)) {
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) {
        // best-effort, but surface it
        throw error;
      }
    }
  }

  // Delete entries in chunks (cascades will clean up sources/entry_media/etc)
  for (const ids of chunk(entryIds, 500)) {
    const { error } = await supabase.from("entries").delete().in("id", ids);
    if (error) throw error;
  }

  console.log(JSON.stringify({ ok: true, dryRun: false, plan }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

