## Governance (v0)

This product is vulnerable to “history wars” and coordinated manipulation. Governance is part of the product.

### Roles

- **Reader**: anyone; can browse public timelines and entries.
- **User**: authenticated; can create timelines, add entries, and comment (subject to rate limits).
- **Curator**: timeline-level role; can pin key moments, mark duplicates, mark disputed, and hide/lock within that timeline.
- **Admin**: global role; can claim/merge timelines, assign curators, and handle escalations (doxxing, legal removals).

### Timeline creation and ownership

- Anyone can create a timeline.
- The creator becomes the initial **Curator** of that timeline by default (unless disabled later).
- Timelines are public by default in MVP.

### “Claim existing” hybrid model

We support grassroots creation, but we also need a mechanism to keep a **canonical** timeline for high-profile topics.

#### Duplicate detection (v0 heuristic)

When a timeline is created or renamed, the system produces a **duplicate candidates list** using:

- normalized title/slug equality, OR
- title similarity + tag overlap above a threshold

Candidates are placed in an **admin review queue**.

#### Claim/merge workflow (admin)

Admins can:

- mark one timeline as **canonical**
- mark another as **duplicate**
- merge by redirecting duplicates to canonical (preserve content + attribution)

Data rules:

- Duplicates keep their IDs for audit/history.
- The duplicate timeline gets `canonical_timeline_id` set.
- Canonical timeline can optionally import entries (v1); for MVP, we start with redirect + optional “related timelines” listing.

### Key moments policy (curator/admin)

- A **Key moment** is a pinned entry intended to remain visible at wider zoom levels.
- Curators can pin/unpin key moments within their timeline.
- Admins can override pins in case of abuse.

### Disputes and corrections

- **Disputed** is not a punishment; it’s a navigational state.
- Prefer **Corrections** (new entries referencing earlier entries) over silent edits.
- Curators can mark an entry disputed and link to competing claims/corrections.

### Abuse handling

- Curators can hide/remove entries/comments and lock threads in their timeline.
- Admins can suspend users and perform legal removals.

See also: `policy.md` and `trust-safety.md`.
