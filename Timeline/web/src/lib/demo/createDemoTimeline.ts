import { slugify } from "../utils/slugify";
import type { EntryType } from "../db/types";

type DemoEntry = {
  type: EntryType;
  title?: string;
  body: string;
  time_start: string; // ISO
  time_end?: string; // ISO
  source_urls?: string[];
  corrects_index?: number;
  pin?: boolean;
};

function iso(d: Date): string {
  return d.toISOString();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function yearsAgo(n: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d;
}

export function buildDemo() {
  const title = "Woman, Life, Freedom (demo)";
  const slug = `${slugify(title)}-${Date.now().toString(36)}`;
  const description =
    "A sample timeline to preview the UX: mixed entry types, sources, corrections, and pinned key moments.";
  const tags = ["demo", "human-rights", "protests"];

  const entries: DemoEntry[] = [
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
      // Public sample video (CC0) used for demo purposes
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

  return { title, slug, description, tags, entries };
}

