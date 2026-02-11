## Timeline

Social media built around **shared, zoomable historical timelines** (months → years) with provenance, corrections, and entry-level discussion.

### Repo structure

- `docs/`: product docs (vision, MVP, UX, trust/safety)
- `supabase/`: SQL migrations (schema + RLS)
- `web/`: Next.js web app (deploy to Vercel)

### Local dev (web)

1) Configure env vars:

- Copy `web/.env.example` → `web/.env.local`
- Set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2) Install + run:

```bash
cd web
npm install
npm run dev
```

### Database

Apply migrations in `supabase/migrations/` to your Supabase project.

### Deployment

See `docs/deploy.md`.

