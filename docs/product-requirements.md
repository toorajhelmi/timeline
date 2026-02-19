## Product requirements (v0)

This is a draft PRD meant to converge on a buildable MVP for long-running timelines (months/years).

### Core object model (conceptual)

- **Timeline**: a container representing a real-world topic/event/movement over time.
- **Entry**: an item placed at a point (or span) in time within a timeline.
- **Source**: a reference supporting an entry (URL, document, media, etc).
- **Discussion**: conversation attached to an entry (not “global comments” by default).
- **Canonical timeline**: the “official” timeline for a topic after duplicates are claimed/merged.

### Entry types (initial candidates)

- **Update**: “what happened” in neutral language (as best as possible)
- **Evidence**: primary material (photo/video/doc) with metadata
- **Claim**: an assertion that may be disputed; must be source-backed or labeled as unsourced
- **Context**: background that helps interpretation (timeless or time-ranged)
- **Correction**: a new entry that supersedes or refines a previous one

### Must-have capabilities

- **Zoomable timeline view**: readable from hours → years using aggregation and “key moments”
- **Filtering**: by entry type, source type, and trust signals (e.g., “has source”)
- **Attribution**: who added what; edit history for entries
- **Entry-level discussion**: comments anchored to an entry
- **Moderation**: timeline-level and entry-level tools (removal, lock, rate-limit, reports)
- **Duplicate handling**: detect likely duplicates and support redirect-to-canonical

### Integrity requirements

- **Immutable audit trail**: edits are tracked; “what changed” is visible.
- **Clear labeling**: opinion vs claim vs evidence; AI-assisted content is labeled.
- **Conflict handling**: allow contradictory claims without collapsing usability (e.g., show as disputed).

### Access model (v0)

- **Public read** of public timelines/entries.
- **Account required** to create timelines, add entries, and comment.
- **Pseudonymous handles** supported.

### Non-goals (for MVP unless we decide otherwise)

- a general-purpose social feed / infinite scroll as the primary home view
- private DMs / group chats
- “creator economy” monetization features
- building a full fact-checking org (we can support community verification without promising certainty)
