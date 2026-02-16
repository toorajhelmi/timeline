/**
 * Ingest events + media into Supabase.
 *
 * Usage:
 *   node ./scripts/ingest-events.mjs --file ./data/events.jsonl --timeline-slug iran-revo-2026
 *
 * Env:
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Notes:
 * - This uses the service role key; do not commit it.
 * - Media downloads are opt-in: add --download-media to fetch remote media and upload to Storage.
 */
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { getOrCreateTimeline, ingestOneRow } from "./lib/ingest.mjs";

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function main() {
  const file = argValue("--file");
  const timelineSlug = argValue("--timeline-slug");
  if (!file) throw new Error("Missing --file");
  if (!timelineSlug) throw new Error("Missing --timeline-slug");

  const timelineTitle = argValue("--timeline-title");
  const timelineDescription = argValue("--timeline-description");
  const timelineTags = (argValue("--timeline-tags") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const downloadMedia = hasFlag("--download-media");
  const bucket = argValue("--bucket") ?? "timeline-media";
  const publicBucket = !hasFlag("--private-bucket");

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const timeline = await getOrCreateTimeline(supabase, timelineSlug, {
    title: timelineTitle,
    description: timelineDescription,
    tags: timelineTags,
    visibility: "public",
  });

  const abs = path.resolve(process.cwd(), file);
  const lines = fs.readFileSync(abs, "utf8").split("\n").filter(Boolean);

  let inserted = 0;
  let uploaded = 0;
  for (const line of lines) {
    const row = JSON.parse(line);
    const result = await ingestOneRow({
      supabase,
      timeline,
      row,
      downloadMedia,
      bucket,
      publicBucket,
    });
    inserted += 1;
    uploaded +=
      result.uploaded.image +
      result.uploaded.video +
      result.uploaded.audio +
      result.uploaded.other;
  }

  console.log(
    JSON.stringify(
      { ok: true, entries_inserted: inserted, media_uploaded: uploaded },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

