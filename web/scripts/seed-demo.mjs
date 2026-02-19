import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function iso(d) {
  return d.toISOString();
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function yearsAgo(n) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d;
}

async function main() {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create (or reuse) a demo contributor user.
  const demoEmail = "demo-contributor@timeline.local";
  const demoPassword = crypto.randomUUID() + "!" + crypto.randomUUID();

  let demoUserId = null;
  // auth-js admin.createUser can intermittently 500; use REST admin API directly.
  const createUserRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { email_verified: true },
    }),
  });

  if (createUserRes.status === 200) {
    const created = await createUserRes.json();
    demoUserId = created.id;
  } else {
    // If it already exists (or create failed), look it up.
    const listRes = await fetch(`${url}/auth/v1/admin/users`, {
      method: "GET",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!listRes.ok) {
      throw new Error(`Failed to list users: ${listRes.status} ${await listRes.text()}`);
    }
    const list = await listRes.json();
    const existing = (list.users ?? []).find((u) => u.email === demoEmail);
    if (!existing) {
      throw new Error(
        `Failed to create demo user: ${createUserRes.status} ${await createUserRes.text()}`,
      );
    }
    demoUserId = existing.id;
  }

  // Ensure profile exists (trigger should do this, but be defensive).
  const upsertProfile = await supabase.from("profiles").upsert(
    {
      id: demoUserId,
      handle: "demo_contributor",
      display_name: "Demo Contributor",
      is_admin: false,
    },
    { onConflict: "id" },
  );
  if (upsertProfile.error) throw upsertProfile.error;

  const title = "Woman, Life, Freedom (demo)";
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const description =
    "A sample timeline to preview the UX: mixed entry types, sources, corrections, and pinned key moments.";
  const tags = ["demo", "human-rights", "protests"];

  const timelineInsert = await supabase
    .from("timelines")
    .insert({
      slug,
      title,
      description,
      tags,
      visibility: "public",
      created_by: demoUserId,
    })
    .select("id,slug")
    .single();
  if (timelineInsert.error) throw timelineInsert.error;

  const timelineId = timelineInsert.data.id;

  const memberInsert = await supabase.from("timeline_members").insert({
    timeline_id: timelineId,
    user_id: demoUserId,
    role: "curator",
  });
  if (memberInsert.error) throw memberInsert.error;

  const entries = [
    {
      type: "context",
      title: "What this demo shows",
      body: "This is demo data to preview the product UX. Entries are deliberately varied: context, updates, claims with sources, evidence, and a correction.",
      time_start: iso(yearsAgo(3)),
      pin: true,
    },
    {
      type: "update",
      title: "Early background",
      body: "Background context and earlier events can be recorded as long-range updates. Use this to anchor readers who join late.",
      time_start: iso(yearsAgo(2)),
    },
    {
      type: "claim",
      title: "A sourced claim (example)",
      body: "Example claim: A major demonstration occurred in multiple cities. This is a placeholder text to demonstrate how claims appear and how sources are attached.",
      time_start: iso(yearsAgo(1)),
      source_urls: ["https://www.example.com/source-claim"],
      pin: true,
    },
    {
      type: "evidence",
      title: "Evidence photo (recent)",
      body: "Example evidence: A primary document / photo / video link. In MVP we store a URL and show it under Sources.",
      time_start: iso(daysAgo(6)),
      source_urls: [
        "https://picsum.photos/seed/timeline-demo-photo/1200/800",
      ],
    },
    {
      type: "evidence",
      title: "Evidence video (recent)",
      body: "Example video evidence: preview shows a poster with a play indicator. In v0, clicking opens the entry detail where the link is available.",
      time_start: iso(daysAgo(4)),
      source_urls: [
        "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        "https://picsum.photos/seed/timeline-demo-video-poster/1200/800",
      ],
    },
    {
      type: "update",
      title: "Week summary (example)",
      body: "Use Update entries to summarize a period. Zooming out should group many entries into readable buckets.",
      time_start: iso(daysAgo(90)),
      pin: true,
    },
    {
      type: "update",
      body: "Smaller moment-by-moment updates can be recorded too. This one has no title to show the compact card style.",
      time_start: iso(daysAgo(7)),
    },
    {
      type: "claim",
      body: "Another claim with a source URL. In real timelines, strong claims should be tied to credible sources and may be marked disputed later.",
      time_start: iso(daysAgo(5)),
      source_urls: ["https://www.example.com/another-source"],
    },
    {
      type: "update",
      body: "An update that later gets corrected (see next entry).",
      time_start: iso(daysAgo(2)),
    },
    {
      type: "correction",
      title: "Correction",
      body: "Correction example: The earlier update mis-stated a detail. Corrections preserve history and make changes explicit.",
      time_start: iso(daysAgo(1)),
      corrects_index: 7,
      pin: true,
    },
  ];

  const entryIds = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const correctsId =
      e.type === "correction" && typeof e.corrects_index === "number"
        ? entryIds[e.corrects_index] ?? null
        : null;

    const inserted = await supabase
      .from("entries")
      .insert({
        timeline_id: timelineId,
        type: e.type,
        title: e.title ?? null,
        body: e.body,
        time_start: e.time_start,
        time_end: e.time_end ?? null,
        corrects_entry_id: correctsId,
        created_by: demoUserId,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    entryIds.push(inserted.data.id);

    const urls = e.source_urls ?? [];
    if (urls.length) {
      const s = await supabase.from("sources").insert(
        urls.map((url) => ({
          entry_id: inserted.data.id,
          url,
          source_type: "web",
          added_by: demoUserId,
        })),
      );
      if (s.error) throw s.error;
    }

    if (e.pin) {
      const km = await supabase.from("timeline_key_moments").insert({
        timeline_id: timelineId,
        entry_id: inserted.data.id,
        pinned_by: demoUserId,
      });
      if (km.error) throw km.error;
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        timeline: { id: timelineId, slug },
        openLocal: `http://localhost:3001/t/${slug}`,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

