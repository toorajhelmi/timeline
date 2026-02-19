import crypto from "node:crypto";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function extFromMime(mime) {
  if (!mime) return "";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("mpeg")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("m4a")) return ".m4a";
  return "";
}

export async function download(url, opts = {}) {
  const maxBytes = opts.maxBytes ?? null;
  const requireContentLength = Boolean(opts.requireContentLength);

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "TimelineIngest/0.1 (+https://github.com/toorajhelmi/timeline) fetch",
    },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);

  const lenHeader = res.headers.get("content-length");
  const contentLength = lenHeader ? Number(lenHeader) : null;
  if (requireContentLength && !contentLength) {
    throw new Error(`Missing content-length (refusing): ${url}`);
  }
  if (maxBytes && contentLength && contentLength > maxBytes) {
    throw new Error(`Too large (${contentLength} bytes, max ${maxBytes}): ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (maxBytes && buf.length > maxBytes) {
    throw new Error(`Too large after download (${buf.length} bytes): ${url}`);
  }

  const mime = res.headers.get("content-type")?.split(";")[0] ?? null;
  return { buf, mime };
}

export async function ensureBucket(supabase, bucket, isPublic) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if ((buckets ?? []).some((b) => b.name === bucket)) return;
  const { error: createErr } = await supabase.storage.createBucket(bucket, {
    public: isPublic,
  });
  if (createErr) throw createErr;
}

export async function getOrCreateTimeline(supabase, slug, opts) {
  const { data: existing, error: tErr } = await supabase
    .from("timelines")
    .select("id,slug,created_by")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (existing) return existing;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.id) {
    throw new Error(
      "No profiles found. Create a user/login once so a profile row exists, then re-run.",
    );
  }

  const { data: timeline, error: iErr } = await supabase
    .from("timelines")
    .insert({
      slug,
      title: opts.title ?? slug,
      description: opts.description ?? "",
      tags: opts.tags ?? [],
      visibility: opts.visibility ?? "public",
      created_by: profile.id,
    })
    .select("id,slug,created_by")
    .single();
  if (iErr) throw iErr;

  await supabase.from("timeline_members").upsert(
    {
      timeline_id: timeline.id,
      user_id: profile.id,
      role: "curator",
    },
    { onConflict: "timeline_id,user_id" },
  );

  return timeline;
}

export async function ingestOneRow({
  supabase,
  timeline,
  row,
  downloadMedia,
  bucket = "timeline-media",
  publicBucket = true,
}) {
  const {
    time_start,
    time_end = null,
    type,
    title = null,
    body,
    status = "active",
    source_urls = [],
    media = [],
  } = row;

  if (!time_start || !type || !body) {
    throw new Error("Row missing time_start/type/body");
  }

  const { data: entry, error: eErr } = await supabase
    .from("entries")
    .insert({
      timeline_id: timeline.id,
      type,
      title,
      body,
      time_start,
      time_end,
      status,
      created_by: timeline.created_by,
    })
    .select("id,time_start")
    .single();
  if (eErr) throw eErr;

  if (source_urls.length) {
    const payload = source_urls.map((url) => ({
      entry_id: entry.id,
      url,
      source_type: "web",
      added_by: timeline.created_by,
    }));
    const { error: sErr } = await supabase.from("sources").insert(payload);
    if (sErr) throw sErr;
  }

  const uploaded = { image: 0, video: 0, audio: 0, other: 0 };

  if (downloadMedia && Array.isArray(media) && media.length) {
    await ensureBucket(supabase, bucket, publicBucket);

    for (const m of media) {
      const url = m.url;
      const kind = m.kind ?? "image";
      if (!url) continue;

      try {
        const maxBytes =
          kind === "video"
            ? 35 * 1024 * 1024
            : kind === "audio"
              ? 15 * 1024 * 1024
              : 8 * 1024 * 1024;
        const requireContentLength = kind === "video";

        const { buf, mime } = await download(url, {
          maxBytes,
          requireContentLength,
        });
        const hash = sha256(buf);
        const ext = m.ext ?? extFromMime(mime) ?? "";
        const objectPath = `${timeline.slug}/${entry.id}/${hash}${ext}`;

        const { error: upErr } = await supabase.storage.from(bucket).upload(objectPath, buf, {
          cacheControl: "31536000",
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
          original_url: url,
          mime_type: mime,
          bytes: buf.length,
          sha256: hash,
          uploaded_by: timeline.created_by,
        });
        if (mErr) throw mErr;

        if (kind === "image") uploaded.image += 1;
        else if (kind === "video") uploaded.video += 1;
        else if (kind === "audio") uploaded.audio += 1;
        else uploaded.other += 1;
      } catch (err) {
        // best-effort; caller may decide to replace row if quotas not met
        console.warn(`WARN: media failed ${kind} ${url}: ${String(err?.message ?? err)}`);
      }
    }
  }

  return { entryId: entry.id, time_start: entry.time_start, uploaded };
}

