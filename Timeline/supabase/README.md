## Supabase

This folder contains SQL migrations for the Timeline MVP.

### Apply migrations

Option A: Supabase SQL editor

- Open your Supabase project → SQL Editor
- Run the latest migration in `supabase/migrations/`

Option B: Supabase CLI (recommended later)

- Initialize and link a Supabase project
- Run migrations

### Environment variables

The web app expects:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

See `web/.env.example`.

