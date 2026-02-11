## MVP definition

### MVP goal

Prove that a timeline can remain **usable and trustworthy enough** as it grows over months/years, and that contributors will add sourced entries because the timeline gives their contribution durable context.

### What “stays navigable” means (v0 targets)

- A reader can reach a specific month/year range in **≤ 3 interactions** (zoom + jump).
- At wide zoom, the UI shows **key moments and aggregated buckets**, not an infinite list.
- Timeline pages remain usable at **10k+ entries** (virtualized list + aggregation).

### MVP scope (suggested)

- **Create and view timelines**
  - title, description, tags, cover image (optional)
  - follow/subscribe (at least via account “watchlist”)

- **Add entries**
  - entry types: Update, Evidence, Claim, Context, Correction
  - timestamp (required) + optional time range
  - source attachment (URL required for Claim/Evidence; optional for Update/Context)
  - edit history + attribution

- **Timeline viewing**
  - zoom levels with aggregation (e.g., day/week/month/year)
  - “Key moments” (manual pinning initially; later assisted)
  - filtering (type + “has source”)

- **Discussion**
  - comments anchored to entries
  - basic moderation: report, delete/hide, lock thread

- **Safety / rate limiting**
  - account required to post
  - public read access (no account required to browse)
  - per-timeline posting limits (tunable)
  - basic anti-spam measures

### Explicitly out of scope (initially)

- realtime “liveblog” mode
- algorithmic personalized feeds
- AI-generated entries auto-published without human review
- complex reputation/roles systems (we can start with basic “trusted curator” assignment)
- mobile apps (web-first)

### Success metrics (choose a few)

- a single timeline reaches \(N\) entries while staying navigable (measured by time-to-find + zoom/filter usage)
- % of entries with sources stays above a threshold (varies by entry type; Claim/Evidence should be very high)
- correction workflows are used (evidence of healthy iteration, not just growth)
- repeat contributors per timeline (retention at the timeline level)
