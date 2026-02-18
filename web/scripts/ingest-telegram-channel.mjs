/**
 * Ingest a Telegram channel into a timeline (programmatic, MTProto).
 *
 * - Logs in interactively on first run and saves a local session file.
 * - Streams messages in a date range, creates entries, stores media in Supabase Storage.
 *
 * Setup (put these in web/.env.local):
 *   TELEGRAM_API_ID=39757238
 *   TELEGRAM_API_HASH=32d2c2414b28217bf985ba28dff45497
 *   TELEGRAM_PHONE=+1...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   SUPABASE_URL=https://<ref>.supabase.co   (or NEXT_PUBLIC_SUPABASE_URL)
 *
 * Usage:
 *   node ./scripts/ingest-telegram-channel.mjs --timeline-slug iran-uprise-2026 --channel @yourchannel --from 2025-12-27
 *   node ./scripts/ingest-telegram-channel.mjs --timeline-slug iran-uprise-2026 --channel https://t.me/yourchannel --from 2025-12-27 --only-media
 *   node ./scripts/ingest-telegram-channel.mjs --timeline-slug iran-uprise-2026 --channel @yourchannel --from 2025-12-27 --dry-run
 *
 * Notes:
 * - This assumes you have access to the channel you specify.
 * - For private channels without a public username, pass an invite link.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

import { ensureBucket, extFromMime, getOrCreateTimeline } from "./lib/ingest.mjs";

// Prevent GramJS update-loop timeouts from killing long ingest runs.
// We treat transient network issues as warnings; the main loop will reconnect/resume.
process.on("unhandledRejection", (reason) => {
  if (isTransientTelegramError(reason)) {
    process.stderr.write(`WARN: unhandledRejection (transient): ${String(reason?.message ?? reason)}\n`);
    return;
  }
  // Surface other issues
  process.stderr.write(`ERROR: unhandledRejection: ${String(reason?.message ?? reason)}\n`);
});
process.on("uncaughtException", (err) => {
  if (isTransientTelegramError(err)) {
    process.stderr.write(`WARN: uncaughtException (transient): ${String(err?.message ?? err)}\n`);
    return;
  }
  process.stderr.write(`ERROR: uncaughtException: ${String(err?.message ?? err)}\n`);
  process.exit(1);
});

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

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function normChannel(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  if (s.startsWith("@")) return s;
  if (s.includes("t.me/")) {
    const m = s.match(/t\.me\/([^/?#]+)/i);
    if (m?.[1]) return `@${m[1]}`;
  }
  // Could be an invite link or raw username; pass as-is
  return s;
}

function toDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function pickKindAndMime(msg) {
  // Photos come as MessageMediaPhoto; videos are generally documents with video/* mime
  const media = msg?.media;
  if (!media) return null;

  if (media instanceof Api.MessageMediaPhoto) {
    return { kind: "image", mime: "image/jpeg" };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    const mime = doc?.mimeType ?? null;
    if (mime?.startsWith("video/")) return { kind: "video", mime };
    if (mime?.startsWith("image/")) return { kind: "image", mime };
    if (mime?.startsWith("audio/")) return { kind: "audio", mime };
    return { kind: "file", mime };
  }

  return { kind: "file", mime: null };
}

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientTelegramError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("connection closed") ||
    msg.includes("disconnecting") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("ehostunreach") ||
    msg.includes("enetunreach") ||
    msg.includes("eai_again")
  );
}

async function ensureConnected(client) {
  try {
    await client.connect();
  } catch {
    // If connect fails, start() will retry in some cases; we leave it to caller.
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function main() {
  loadLocalEnv();

  const timelineSlug = String(argValue("--timeline-slug") ?? "").trim();
  const channelRaw = argValue("--channel");
  const fromStr = String(argValue("--from") ?? "2025-12-27").trim();
  const toStr = String(argValue("--to") ?? "").trim();
  const onlyMedia = hasFlag("--only-media");
  const dryRun = hasFlag("--dry-run");
  const maxMessages = Number(argValue("--max") ?? 0) || null;
  const checkpointEvery = Number(argValue("--checkpoint-every") ?? 5) || 5;
  const dbDedupe = hasFlag("--db-dedupe");

  if (!timelineSlug) throw new Error("Missing --timeline-slug");
  const channel = normChannel(channelRaw);
  if (!channel) throw new Error("Missing --channel");

  const fromDate = new Date(`${fromStr}T00:00:00.000Z`);
  if (Number.isNaN(fromDate.getTime())) throw new Error(`Invalid --from: ${fromStr}`);
  const toDate = toStr ? new Date(`${toStr}T23:59:59.999Z`) : new Date();
  if (Number.isNaN(toDate.getTime())) throw new Error(`Invalid --to: ${toStr}`);

  const supabaseUrl = requireEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]);
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const apiId = Number(requireEnv("TELEGRAM_API_ID"));
  const apiHash = requireEnv("TELEGRAM_API_HASH");
  const phone = requireEnv("TELEGRAM_PHONE");

  const sessionFile = path.join(process.cwd(), ".telegram-session.txt");
  const sessionStr = fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8").trim() : "";
  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => phone,
    phoneCode: async () => String(await prompt("Telegram login code: ")).trim(),
    password: async () => String(await prompt("Telegram 2FA password (if enabled, else blank): ")).trim(),
    onError: (err) => console.error(err),
  });

  const saved = client.session.save();
  if (saved && saved !== sessionStr) {
    fs.writeFileSync(sessionFile, saved, "utf8");
  }

  const entity = await client.getEntity(channel);

  const timeline = await getOrCreateTimeline(supabase, timelineSlug, {
    title: timelineSlug,
    description: "",
    tags: ["telegram"],
    visibility: "public",
  });

  const bucket = "timeline-media";
  if (!dryRun) await ensureBucket(supabase, bucket, true);

  const checkpointDir = path.join(process.cwd(), ".telegram-checkpoints");
  ensureDir(checkpointDir);
  const checkpointFile = path.join(
    checkpointDir,
    `${timelineSlug}_${String(channel).replaceAll("/", "_").replaceAll("@", "")}.json`,
  );

  let checkpoint = null;
  if (fs.existsSync(checkpointFile)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
    } catch {
      checkpoint = null;
    }
  }

  let ingested = 0;
  let ingestedMedia = 0;
  let ingestedVideos = 0;
  let scanned = 0;
  let lastProcessedId = checkpoint?.last_message_id ?? null;
  let lastProcessedDay = checkpoint?.last_day ?? null;
  let wroteStartCheckpoint = false;

  // Auto-resume loop:
  // Iterate backward in time (newest → oldest) and stop when we pass `fromDate`.
  // If the connection drops, reconnect and resume from the last processed message id.
  const resume = !hasFlag("--no-resume");
  const offsetDateSec = Math.floor(toDate.getTime() / 1000);
  let attempts = 0;

  function writeCheckpoint(kind) {
    const payload = {
      channel: String(channel),
      timeline: timelineSlug,
      from: fromStr,
      to: toStr || null,
      last_message_id: lastProcessedId,
      last_day: lastProcessedDay,
      scanned,
      ingested,
      ingestedMedia,
      ingestedVideos,
      kind,
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(checkpointFile, JSON.stringify(payload, null, 2), "utf8");
  }

  while (true) {
    try {
      const offsetId = resume && lastProcessedId ? Number(lastProcessedId) : 0;
      const it = client.iterMessages(entity, {
        // GramJS expects offsetDate as unix timestamp (seconds).
        offsetDate: offsetDateSec,
        // Resume by continuing "older than" the last processed message id.
        offsetId: offsetId || 0,
      });

      for await (const msg of it) {
        if (!msg) continue;
        // GramJS message.date is a unix timestamp (seconds).
        const dt = msg.date ? new Date(Number(msg.date) * 1000) : null;
        if (!dt || Number.isNaN(dt.getTime())) continue;
        if (dt > toDate) continue;
        if (dt < fromDate) {
          throw Object.assign(new Error("DONE_REACHED_FROM_DATE"), { code: "DONE_REACHED_FROM_DATE" });
        }

        scanned += 1;

        const kindInfo = pickKindAndMime(msg);
        const hasMedia = Boolean(kindInfo && msg.media);
        if (onlyMedia && !hasMedia) continue;

        const text = String(msg.message ?? "").trim();
        // Avoid placeholder bodies like "Telegram message." — if there's no text, keep body empty.
        const body = text || "";
        const title = text ? text.split("\n")[0].slice(0, 140) : null;
        const time_start = dt.toISOString();

        // Build a stable-ish source URL
        let sourceUrl = null;
        if (typeof channel === "string" && channel.startsWith("@")) {
          sourceUrl = `https://t.me/${channel.slice(1)}/${msg.id}`;
        } else {
          sourceUrl = `tg://message?peer=${String(entity.id)}&msg_id=${msg.id}`;
        }

        // Optional DB-level dedupe (slower). Default off for speed.
        if (dbDedupe && !dryRun && sourceUrl) {
          const { data: existing, error: exErr } = await supabase
            .from("sources")
            .select("id,entry:entries(id,timeline_id)")
            .eq("url", sourceUrl)
            .limit(1);
          if (exErr) throw exErr;
          const hit = (existing ?? []).find((r) => r?.entry?.timeline_id === timeline.id);
          if (hit) {
            lastProcessedId = msg.id;
            lastProcessedDay = toDateOnly(dt);
            continue;
          }
        }

        if (dryRun) {
          ingested += 1;
          if (hasMedia) {
            ingestedMedia += 1;
            if (kindInfo.kind === "video") ingestedVideos += 1;
          }
        } else {
          // Create entry
          const entryType = hasMedia ? "evidence" : "update";
          const { data: entry, error: eErr } = await supabase
            .from("entries")
            .insert({
              timeline_id: timeline.id,
              type: entryType,
              title,
              body,
              time_start,
              time_end: null,
              status: "active",
              created_by: timeline.created_by,
            })
            .select("id")
            .single();
          if (eErr) throw eErr;

          if (sourceUrl) {
            const { error: sErr } = await supabase.from("sources").insert({
              entry_id: entry.id,
              url: sourceUrl,
              source_type: "telegram",
              added_by: timeline.created_by,
            });
            if (sErr) throw sErr;
          }

          if (hasMedia) {
            const { kind, mime } = kindInfo;
            const maxBytes = kind === "video" ? 60 * 1024 * 1024 : 12 * 1024 * 1024;
            const buf = await client.downloadMedia(msg);
            if (buf && Buffer.isBuffer(buf) && buf.length > 0) {
              if (buf.length > maxBytes) {
                // too large, skip media (keep entry)
              } else {
                const hash = sha256(buf);
                const ext = extFromMime(mime) || "";
                const objectPath = `${timeline.slug}/${entry.id}/${hash}${ext}`;

                const { error: upErr } = await supabase.storage.from(bucket).upload(objectPath, buf, {
                  contentType: mime ?? undefined,
                  upsert: false,
                });
                if (upErr && !String(upErr.message ?? "").toLowerCase().includes("already exists")) {
                  throw upErr;
                }

                const { error: mErr } = await supabase.from("entry_media").insert({
                  entry_id: entry.id,
                  kind,
                  storage_bucket: bucket,
                  storage_path: objectPath,
                  original_url: sourceUrl,
                  mime_type: mime,
                  bytes: buf.length,
                  sha256: hash,
                  uploaded_by: timeline.created_by,
                });
                if (mErr) throw mErr;

                ingestedMedia += 1;
                if (kind === "video") ingestedVideos += 1;
              }
            }
          }

          ingested += 1;
        }

        lastProcessedId = msg.id;
        lastProcessedDay = toDateOnly(dt);

        if (!wroteStartCheckpoint) {
          writeCheckpoint("start");
          wroteStartCheckpoint = true;
        }
        // Frequent checkpoints so resumes are tight (default every 5 ingests).
        if (ingested && ingested % checkpointEvery === 0) {
          writeCheckpoint("progress");
        }

        if (maxMessages && ingested >= maxMessages) {
          throw Object.assign(new Error("DONE_MAX_MESSAGES"), { code: "DONE_MAX_MESSAGES" });
        }

        if (scanned % 50 === 0) {
          process.stderr.write(
            `scanned=${scanned} ingested=${ingested} media=${ingestedMedia} videos=${ingestedVideos} day=${toDateOnly(dt)}\n`,
          );
        }
      }

      // iterator ended naturally
      break;
    } catch (err) {
      const code = err?.code ?? null;
      if (code === "DONE_REACHED_FROM_DATE" || String(err?.message ?? "") === "DONE_REACHED_FROM_DATE") break;
      if (code === "DONE_MAX_MESSAGES" || String(err?.message ?? "") === "DONE_MAX_MESSAGES") break;

      if (!isTransientTelegramError(err)) throw err;

      attempts += 1;
      const backoffMs = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
      process.stderr.write(
        `WARN: transient telegram error; reconnecting in ${backoffMs}ms: ${String(err?.message ?? err)}\n`,
      );
      await sleep(backoffMs);
      await ensureConnected(client);
      continue;
    }
  }

  const finalCheckpoint = {
    channel: String(channel),
    timeline: timelineSlug,
    from: fromStr,
    to: toStr || null,
    last_message_id: lastProcessedId,
    last_day: lastProcessedDay,
    scanned,
    ingested,
    ingestedMedia,
    ingestedVideos,
    kind: "finished",
    finished_at: new Date().toISOString(),
  };
  fs.writeFileSync(checkpointFile, JSON.stringify(finalCheckpoint, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        timeline: timelineSlug,
        channel: String(channel),
        range: { from: fromStr, to: toStr || "now" },
        scanned,
        ingested,
        media: ingestedMedia,
        videos: ingestedVideos,
        checkpointFile,
      },
      null,
      2,
    ),
  );

  await client.disconnect();
  // Avoid background update-loop noise after completion.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

