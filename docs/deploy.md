## Deploy (Supabase + Vercel)

### 1) Supabase project

- Create a Supabase project.
- Apply SQL migrations from `supabase/migrations/` (in order).
- In Supabase Auth settings:
  - Enable Email / OTP (magic link) sign-in.
  - Add redirect URLs:
    - `http://localhost:3000/auth/callback`
    - `https://<your-vercel-domain>/auth/callback`

### 2) Vercel project

- Create a new Vercel project from this repo.
- Set the **Root Directory** to `web/`.
- Add Environment Variables (Production + Preview as needed):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Build settings (defaults usually work):

- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Output**: Next.js default

### 3) Verify

- Public read:
  - Visit `/` and confirm the page loads.
  - Create a timeline (requires login) then confirm it appears in Explore.
- Auth:
  - Visit `/login` and request a magic link.
  - Confirm you land back on `/` logged in.
- Writes:
  - Create timeline at `/new`.
  - Add entry via `/t/<slug>/add`.
  - Comment on an entry page.
- Moderation:
  - Submit a report on an entry.
  - As an admin user, verify `/admin/reports` and `/admin/timelines`.

### Making an admin user

For MVP, admin is controlled by `profiles.is_admin = true` in the database.

