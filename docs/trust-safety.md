## Trust & safety (v0)

Long-running political timelines will attract harassment, propaganda, and attempts to rewrite history. This doc sketches baseline protections.

### Content integrity

- **Source-aware entries**: certain entry types (Claim/Evidence) should strongly require sources.
- **Provenance**: show source URLs, timestamps, and edit history prominently.
- **Corrections over edits**: prefer “Correction” entries to silently rewriting history; keep diffs visible.
- **AI labeling**: AI-assisted summaries or clustering must be labeled and traceable to underlying entries.

### Moderation basics (MVP)

- per-entry: report, hide/remove, lock discussion, mark disputed
- per-user: rate limit, temporary mute/ban
- per-timeline: trusted curator(s) who can pin key moments and resolve duplicates

### Harassment & doxxing controls

- prohibit posting personal addresses/phone numbers/IDs
- fast-path reporting for doxxing
- link safety (warn for suspicious domains; later)
- private individuals: special care for “non-public figure” rules

### Coordinated manipulation

- detect bursts of similar posts / link spam per timeline
- restrict brand-new accounts from high-volume posting
- transparency: show “new account” / “low history” signals carefully (avoid witch-hunts)

### Legal / policy notes

- define terms: defamation, hate, threats, doxxing
- create a basic enforcement policy before launch (even for alpha)

### Related docs

- `policy.md`: what content is prohibited/restricted and enforcement actions
- `governance.md`: roles and how we resolve duplicates/disputes
