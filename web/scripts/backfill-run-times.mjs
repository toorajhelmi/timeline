/**
 * Backfill entry.time_start for an ingest run, using GDELT seendate.
 *
 * Why: if parseSeenDate couldn't parse GDELT's seendate format, we inserted
 * entries with time_start = now(), which breaks historical timeline ordering.
 *
 * Usage:
 *   node ./scripts/backfill-run-times.mjs --event-slug iran-uprise-2026
 *   node ./scripts/backfill-run-times.mjs --event-slug iran-uprise-2026 --run-id <uuid>
 *   node ./scripts/backfill-run-times.mjs --event-slug iran-uprise-2026 --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import { addDays, buildDefaultIranUpriseQuery, collectGdeltDocDay, isoDay, parseSeenDate } from "./lib/gdelt.mjs";

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

function toIsoStart(dateOnly) {
  return `${dateOnly}T00:00:00.000Z`;
}

function addDaysIso(dateOnly, days) {
  const d = new Date(toIsoStart(dateOnly));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function main() {
  loadLocalEnv();

  const eventSlug = argValue("--event-slug");
  if (!eventSlug) throw new Error("Missing --event-slug");
  const runId = argValue("--run-id");
  const dryRun = hasFlag("--dry-run");

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: evt, error: eErr } = await supabase
    .from("ingest_events")
    .select("*")
    .eq("slug", eventSlug)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!evt) throw new Error(`ingest_event not found: ${eventSlug}`);

  const { data: run, error: rErr } = runId
    ? await supabase.from("ingest_runs").select("*").eq("id", runId).maybeSingle()
    : await supabase
        .from("ingest_runs")
        .select("*")
        .eq("event_id", evt.id)
        .eq("status", "success")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  if (rErr) throw rErr;
  if (!run) throw new Error(`ingest_run not found (event=${eventSlug} runId=${runId ?? "latest_success"})`);

  const query = evt.source_query || buildDefaultIranUpriseQuery();
  const poolSize = Math.max((evt.daily_total ?? 20) * 4, 80);

  // Build URL->time_start map for the run's date range from GDELT.
  const urlToTime = new Map();
  const fromDay = new Date(`${run.range_from}T00:00:00.000Z`);
  const toDay = new Date(`${run.range_to}T00:00:00.000Z`);
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    const arts = await collectGdeltDocDay({ day: d, maxRecords: poolSize, query });
    for (const a of arts ?? []) {
      const url = a?.url;
      const seen = a?.seendate ?? a?.seenDate ?? a?.seen_date ?? null;
      const ts = parseSeenDate(seen);
      if (url && ts) urlToTime.set(url, ts);
    }
  }

  const { data: timeline, error: tErr } = await supabase
    .from("timelines")
    .select("id,slug")
    .eq("slug", evt.timeline_slug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!timeline) throw new Error(`timeline not found: ${evt.timeline_slug}`);

  // Pull entries created during the run window and map via sources.url.
  const { data: entries, error: enErr } = await supabase
    .from("entries")
    .select("id,time_start,created_at")
    .eq("timeline_id", timeline.id)
    .gte("created_at", run.started_at)
    .lte("created_at", run.ended_at ?? new Date().toISOString())
    .limit(5000);
  if (enErr) throw enErr;

  const entryIds = (entries ?? []).map((e) => e.id);
  const { data: sources, error: sErr } = entryIds.length
    ? await supabase.from("sources").select("entry_id,url").in("entry_id", entryIds)
    : { data: [], error: null };
  if (sErr) throw sErr;

  const entryToUrl = new Map();
  for (const s of sources ?? []) {
    if (!entryToUrl.has(s.entry_id)) entryToUrl.set(s.entry_id, s.url);
  }

  let updated = 0;
  let missing = 0;
  const updates = [];
  for (const e of entries ?? []) {
    const url = entryToUrl.get(e.id);
    if (!url) {
      missing += 1;
      continue;
    }
    const ts = urlToTime.get(url);
    if (!ts) {
      missing += 1;
      continue;
    }
    updates.push({ id: e.id, time_start: ts });
  }

  if (!dryRun) {
    // Update one-by-one to keep it simple and debuggable.
    for (const u of updates) {
      const { error: uErr } = await supabase.from("entries").update({ time_start: u.time_start }).eq("id", u.id);
      if (uErr) throw uErr;
      updated += 1;
    }
  } else {
    updated = updates.length;
  }

  const fromIso = toIsoStart(run.range_from);
  const toExclusive = addDaysIso(run.range_to, 1);
  const { count: inRangeAfter, error: cErr } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("timeline_id", timeline.id)
    .gte("time_start", fromIso)
    .lt("time_start", toExclusive);
  if (cErr) throw cErr;

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        event: evt.slug,
        timeline: timeline.slug,
        run: { id: run.id, range: [run.range_from, run.range_to], started_at: run.started_at, ended_at: run.ended_at },
        url_map_size: urlToTime.size,
        candidates_poolSize: poolSize,
        entries_found_in_run_window: entryIds.length,
        updated_time_start: updated,
        missing_url_or_time: missing,
        entries_in_run_range_after: inRangeAfter ?? 0,
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

