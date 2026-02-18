/**
 * Run a single ingestion batch for an ingest_event (5-day chunks).
 *
 * IMPORTANT: This does NOT run automatically. You must invoke it.
 *
 * It enforces per-day quotas by retrying additional candidates when media
 * downloads fail, and updates ingest_events.next_day after each day.
 *
 * Usage:
 *   node ./scripts/run-ingest-batch.mjs --event-slug iran-uprise-2026 --dry-run
 *   node ./scripts/run-ingest-batch.mjs --event-slug iran-uprise-2026
 *
 * Env:
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

import {
  addDays,
  buildDefaultIranUpriseQuery,
  collectGdeltDocDay,
  enrichOgMedia,
  isoDay,
  parseSeenDate,
} from "./lib/gdelt.mjs";
import { getOrCreateTimeline, ingestOneRow } from "./lib/ingest.mjs";

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
    // ok: file may not exist
  }
}

function loadLocalEnv() {
  // Allow running directly without manually exporting env vars.
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

function toDateOnly(d) {
  return isoDay(d);
}

function msSince(t) {
  return Date.now() - t;
}

function buildRowFromArticle(article) {
  const url = article?.url;
  const title = article?.title ?? null;
  const seen = article?.seendate ?? null;
  const domain = article?.domain ?? null;
  const sourceCountry = article?.sourceCountry ?? null;

  const time_start = parseSeenDate(seen) ?? new Date().toISOString();
  const bodyParts = [
    domain ? `Source: ${domain}` : null,
    sourceCountry ? `Source country: ${sourceCountry}` : null,
  ].filter(Boolean);

  return {
    time_start,
    type: "update",
    title,
    body: bodyParts.join("\n") || "Linked source article.",
    status: "active",
    source_urls: url ? [url] : [],
    media: [],
  };
}

function pickNextCandidate({ candidates, usedUrls, predicate }) {
  for (const c of candidates) {
    const url = c?.source_urls?.[0];
    if (!url) continue;
    if (usedUrls.has(url)) continue;
    if (predicate && !predicate(c)) continue;
    usedUrls.add(url);
    return c;
  }
  return null;
}

async function main() {
  loadLocalEnv();

  const eventSlug = argValue("--event-slug");
  if (!eventSlug) throw new Error("Missing --event-slug");

  const dryRun = hasFlag("--dry-run");
  const pauseAfterBatch = !hasFlag("--keep-unpaused");

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
  if (evt.is_paused) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "paused" }, null, 2));
    return;
  }

  const query = evt.source_query || buildDefaultIranUpriseQuery();
  const batchDays = evt.batch_days ?? 5;

  const fromDay = new Date(`${evt.next_day}T00:00:00.000Z`);
  const toDay = addDays(fromDay, batchDays - 1);

  const { data: run, error: rErr } = await supabase
    .from("ingest_runs")
    .insert({
      event_id: evt.id,
      status: "running",
      range_from: toDateOnly(fromDay),
      range_to: toDateOnly(toDay),
      totals: {
        phase: "starting",
        current_day: toDateOnly(fromDay),
        last_update_at: new Date().toISOString(),
      },
    })
    .select("*")
    .single();
  if (rErr) throw rErr;

  const totals = { days: 0, entries: 0, media: 0, videos: 0, images: 0 };
  let lastRunUpdateAt = 0;
  let runTotals = {
    ...totals,
    phase: "starting",
    current_day: toDateOnly(fromDay),
    day_targets: null,
    day_progress: null,
    candidates: null,
    last_update_at: new Date().toISOString(),
  };

  async function updateRunTotals(patch, { force = false } = {}) {
    if (dryRun) return;
    if (!force && lastRunUpdateAt && msSince(lastRunUpdateAt) < 1500) return;
    lastRunUpdateAt = Date.now();
    runTotals = {
      ...runTotals,
      ...totals,
      ...(patch ?? {}),
      last_update_at: new Date().toISOString(),
    };
    await supabase.from("ingest_runs").update({ totals: runTotals }).eq("id", run.id);
  }

  try {
    const timeline = await getOrCreateTimeline(supabase, evt.timeline_slug, {
      title: evt.title,
      description: evt.description,
      tags: ["iran", "uprise", "2026"],
      visibility: "public",
    });

    for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
      const dayLabel = isoDay(d);
      const dayTargets = { total: evt.daily_total ?? 20, media: evt.daily_media ?? 8, video: evt.daily_video ?? 2 };
      const dayProgress = { entries: 0, media: 0, videos: 0, images: 0 };

      await updateRunTotals(
        {
          phase: "collect_candidates",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
          candidates: null,
        },
        { force: true },
      );

      // Collect a pool larger than daily_total to allow replacement when media fails.
      const poolSize = Math.max(evt.daily_total * 4, 80);
      const arts = await collectGdeltDocDay({
        day: d,
        maxRecords: poolSize,
        query,
      });
      await updateRunTotals({
        phase: "candidates_collected",
        current_day: dayLabel,
        day_targets: dayTargets,
        day_progress: dayProgress,
        candidates: { fetched: arts.length, poolSize },
      });

      const candidates = [];
      for (const a of arts) {
        const row = buildRowFromArticle(a);
        candidates.push(row);
      }

      // Enrich top of pool to find media candidates.
      // We do this lazily as we pick candidates.
      let dayEntries = 0;
      let dayMedia = 0;
      let dayVideos = 0;
      let dayImages = 0;

      // Important:
      // - We must NOT "consume" candidates during video/media searching, otherwise later phases
      //   (like fill_text) can end up with 0 available candidates even though we fetched many.
      // - So each phase gets its own "seen" set, and only *successful ingests* go into usedIngestUrls.
      const usedIngestUrls = new Set(); // successfully inserted for this day
      const seenForVideo = new Set();
      const seenForMedia = new Set();
      const seenForText = new Set();

      // Keep a map of URL -> enriched media to avoid repeated fetches.
      const enrichedCache = new Map();
      let enrichedCount = 0;
      let foundMediaCandidates = 0;
      let foundVideoCandidates = 0;

      async function ensureEnriched(row) {
        const url = row?.source_urls?.[0];
        if (!url) return row;
        if (enrichedCache.has(url)) {
          row.media = enrichedCache.get(url);
          return row;
        }
        await updateRunTotals({
          phase: "enriching",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
          candidates: {
            fetched: arts.length,
            poolSize,
            enriched: enrichedCount,
            media_candidates: foundMediaCandidates,
            video_candidates: foundVideoCandidates,
          },
        });
        const media = await enrichOgMedia(url);
        enrichedCache.set(url, media);
        row.media = media;
        enrichedCount = enrichedCache.size;
        const hasVideo = (media ?? []).some((m) => m.kind === "video");
        const hasAnyMedia = (media ?? []).some((m) => m.kind === "image" || m.kind === "video");
        if (hasAnyMedia) foundMediaCandidates += 1;
        if (hasVideo) foundVideoCandidates += 1;
        await updateRunTotals({
          phase: "enriching",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
          candidates: {
            fetched: arts.length,
            poolSize,
            enriched: enrichedCount,
            media_candidates: foundMediaCandidates,
            video_candidates: foundVideoCandidates,
          },
        });
        return row;
      }

      const targetTotal = evt.daily_total ?? 20;
      const targetMedia = evt.daily_media ?? 8;
      const targetVideo = evt.daily_video ?? 2;

      // Phase 1: satisfy video quota
      await updateRunTotals({
        phase: "fill_videos",
        current_day: dayLabel,
        day_targets: dayTargets,
        day_progress: dayProgress,
      });
      while (dayVideos < targetVideo) {
        const row = pickNextCandidate({
          candidates,
          usedUrls: seenForVideo,
          predicate: (c) => {
            const url = c?.source_urls?.[0];
            if (!url) return false;
            if (usedIngestUrls.has(url)) return false;
            return true;
          },
        });
        if (!row) break;

        await ensureEnriched(row);
        const hasVideo = (row.media ?? []).some((m) => m.kind === "video");
        if (!hasVideo) continue;

        const rowUrl = row?.source_urls?.[0];

        if (dryRun) {
          dayEntries += 1;
          dayVideos += 1;
          dayMedia += 1;
          if (rowUrl) usedIngestUrls.add(rowUrl);
          continue;
        }

        const res = await ingestOneRow({
          supabase,
          timeline,
          row,
          downloadMedia: true,
        });

        // verify DB has a video row for this entry; otherwise replace
        const { data: mediaRows, error: mErr } = await supabase
          .from("entry_media")
          .select("kind")
          .eq("entry_id", res.entryId);
        if (mErr) throw mErr;

        const storedKinds = (mediaRows ?? []).map((x) => x.kind);
        const storedHasVideo = storedKinds.includes("video");
        if (!storedHasVideo) {
          // replacement: delete entry and try next
          await supabase.from("entries").delete().eq("id", res.entryId);
          continue;
        }

        dayEntries += 1;
        dayVideos += 1;
        dayMedia += 1;
        dayImages += storedKinds.includes("image") ? 1 : 0;
        if (rowUrl) usedIngestUrls.add(rowUrl);

        dayProgress.entries = dayEntries;
        dayProgress.media = dayMedia;
        dayProgress.videos = dayVideos;
        dayProgress.images = dayImages;
        await updateRunTotals({
          phase: "fill_videos",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
        });
      }

      // Phase 2: satisfy remaining media quota (images/videos)
      await updateRunTotals({
        phase: "fill_media",
        current_day: dayLabel,
        day_targets: dayTargets,
        day_progress: dayProgress,
      });
      while (dayMedia < targetMedia) {
        const row = pickNextCandidate({
          candidates,
          usedUrls: seenForMedia,
          predicate: (c) => {
            const url = c?.source_urls?.[0];
            if (!url) return false;
            if (usedIngestUrls.has(url)) return false;
            return true;
          },
        });
        if (!row) break;
        await ensureEnriched(row);
        const hasAnyMedia = (row.media ?? []).some((m) => m.kind === "image" || m.kind === "video");
        if (!hasAnyMedia) continue;

        const rowUrl = row?.source_urls?.[0];

        if (dryRun) {
          dayEntries += 1;
          dayMedia += 1;
          if (rowUrl) usedIngestUrls.add(rowUrl);
          continue;
        }

        const res = await ingestOneRow({
          supabase,
          timeline,
          row,
          downloadMedia: true,
        });

        const { data: mediaRows, error: mErr } = await supabase
          .from("entry_media")
          .select("kind")
          .eq("entry_id", res.entryId);
        if (mErr) throw mErr;
        const storedKinds = (mediaRows ?? []).map((x) => x.kind);
        const storedHasMedia = storedKinds.some((k) => k === "image" || k === "video");
        if (!storedHasMedia) {
          await supabase.from("entries").delete().eq("id", res.entryId);
          continue;
        }

        dayEntries += 1;
        dayVideos += storedKinds.includes("video") ? 1 : 0;
        dayMedia += 1;
        dayImages += storedKinds.includes("image") ? 1 : 0;
        if (rowUrl) usedIngestUrls.add(rowUrl);

        dayProgress.entries = dayEntries;
        dayProgress.media = dayMedia;
        dayProgress.videos = dayVideos;
        dayProgress.images = dayImages;
        await updateRunTotals({
          phase: "fill_media",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
        });
      }

      // Phase 3: fill remaining total with text-only (no media needed)
      await updateRunTotals({
        phase: "fill_text",
        current_day: dayLabel,
        day_targets: dayTargets,
        day_progress: dayProgress,
      });
      while (dayEntries < targetTotal) {
        const row = pickNextCandidate({
          candidates,
          usedUrls: seenForText,
          predicate: (c) => {
            const url = c?.source_urls?.[0];
            if (!url) return false;
            if (usedIngestUrls.has(url)) return false;
            return true;
          },
        });
        if (!row) break;

        const rowUrl = row?.source_urls?.[0];

        if (dryRun) {
          dayEntries += 1;
          if (rowUrl) usedIngestUrls.add(rowUrl);
          continue;
        }

        await ingestOneRow({
          supabase,
          timeline,
          row,
          downloadMedia: false,
        });
        dayEntries += 1;
        if (rowUrl) usedIngestUrls.add(rowUrl);

        dayProgress.entries = dayEntries;
        await updateRunTotals({
          phase: "fill_text",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
        });
      }

      // Update checkpoint after each day (even in dry-run we simulate)
      if (!dryRun) {
        const next = addDays(d, 1);
        await supabase
          .from("ingest_events")
          .update({
            next_day: toDateOnly(next),
            last_success_day: dayLabel,
          })
          .eq("id", evt.id);
      }

      totals.days += 1;
      totals.entries += dayEntries;
      totals.media += dayMedia;
      totals.videos += dayVideos;
      totals.images += dayImages;
      totals.last_day = dayLabel;
      totals.last_day_stats = {
        entries: dayEntries,
        media: dayMedia,
        videos: dayVideos,
        images: dayImages,
      };

      await updateRunTotals(
        {
          phase: "day_done",
          current_day: dayLabel,
          day_targets: dayTargets,
          day_progress: dayProgress,
        },
        { force: true },
      );

      process.stderr.write(
        `Day ${dayLabel}: entries=${dayEntries} media=${dayMedia} video=${dayVideos} (dryRun=${dryRun})\n`,
      );
    }

    if (!dryRun) {
      await supabase
        .from("ingest_runs")
        .update({
          status: "success",
          ended_at: new Date().toISOString(),
          totals: {
            ...runTotals,
            ...totals,
            phase: "done",
            current_day: toDateOnly(toDay),
            last_update_at: new Date().toISOString(),
          },
        })
        .eq("id", run.id);

      if (pauseAfterBatch) {
        await supabase.from("ingest_events").update({ is_paused: true }).eq("id", evt.id);
      }
    }

    console.log(JSON.stringify({ ok: true, dryRun, event: evt.slug, range: [toDateOnly(fromDay), toDateOnly(toDay)], totals }, null, 2));
  } catch (err) {
    if (!dryRun) {
      await supabase
        .from("ingest_runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          totals: {
            ...runTotals,
            ...totals,
            phase: "failed",
            last_update_at: new Date().toISOString(),
          },
          error: String(err?.message ?? err),
        })
        .eq("id", run.id);

      if (pauseAfterBatch) {
        await supabase.from("ingest_events").update({ is_paused: true }).eq("id", evt.id);
      }
    }
    throw err;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

