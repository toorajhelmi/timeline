export type TimelineVisibility = "public" | "limited" | "private";

export type Timeline = {
  id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  visibility: TimelineVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
  canonical_timeline_id: string | null;
};

export type EntryType = "update" | "evidence" | "claim" | "context" | "correction";
export type ContentStatus = "active" | "hidden" | "removed" | "disputed";

export type Zoom = "year" | "month" | "week" | "day";

export type Entry = {
  id: string;
  timeline_id: string;
  type: EntryType;
  title: string | null;
  body: string;
  time_start: string;
  time_end: string | null;
  status: ContentStatus;
  is_locked: boolean;
  corrects_entry_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Source = {
  id: string;
  entry_id: string;
  url: string;
  source_type: string;
  added_by: string;
  created_at: string;
};

export type Comment = {
  id: string;
  entry_id: string;
  body: string;
  status: ContentStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

