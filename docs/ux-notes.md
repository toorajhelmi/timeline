## UX notes (v0)

### Timeline readability across months/years

We need the UI to “compress” time without losing meaning.

- **Aggregation**: group entries into buckets by zoom (day/week/month/year).
- **Key moments**: pinned milestones visible at wider zoom.
- **Clusters**: detect dense periods (e.g., “Week of major protests”) and present as expandable chapters.

#### Zoom levels (v0)

- **Year**: show key moments + monthly buckets
- **Month**: show key moments + weekly buckets
- **Week**: show daily buckets
- **Day**: show hourly buckets (or direct entries if sparse)

#### Default ordering and density control

- Default view should avoid showing an “infinite list” at wide zoom.
- When a bucket contains many entries, show a compact summary card + allow expand.

### Primary views

- **Explore timelines**: browse/search timelines by topic/tag.
- **Timeline detail**:
  - zoomable axis (scrub/zoom)
  - highlights strip (key moments)
  - entry list (sorted by time; virtualized)
  - filters
  - “add entry” CTA
- **Entry detail**:
  - entry content + sources + metadata
  - edit history
  - discussion thread
  - “add correction” / “add related entry”

### Contribution flow

Minimize friction while preserving structure:

- choose type (Update / Evidence / Claim / Context / Correction)
- enter content
- pick timestamp (default “now”, editable)
- attach source(s) (URL paste; later: upload)
- submit

#### Validation (v0)

- Claim/Evidence: require at least 1 source URL.
- Correction: require selecting the entry being corrected.

### Handling disputes

- show **Disputed** state when credible contradictions exist
- don’t hide conflict; make it navigable
- support “correction” as a first-class action instead of silent edits

### Accessibility / internationalization

- keyboard navigable timeline + zoom controls
- timezone clarity (timeline has a canonical timezone; entries show original/local when relevant)
- multilingual content strategy (likely “language per entry” + per-user filters later)
