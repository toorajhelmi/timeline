# Telegram ingestion (programmatic)

This project supports programmatic ingestion from Telegram channels using MTProto (GramJS).

## Prereqs

- Telegram API credentials from `my.telegram.org`
  - `TELEGRAM_API_ID`
  - `TELEGRAM_API_HASH`
- A Telegram account that can access the channel
  - `TELEGRAM_PHONE`
- Supabase service-role credentials (server-side)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)

Put these in `web/.env.local` (do not commit).

## Main command (Iran uprise 2026, channel `@iliaen`)

Run from the `web/` folder:

```bash
cd "/Users/thelmi/source/Timeline/web"
node ./scripts/ingest-telegram-channel.mjs \
  --timeline-slug iran-uprise-2026 \
  --channel @iliaen \
  --from 2025-12-27 \
  --only-media
```

## Resume behavior

Re-running the **same command** resumes automatically using the checkpoint file:

- `web/.telegram-checkpoints/iran-uprise-2026_iliaen.json`

The ingester:

- resumes from the last processed Telegram message id
- avoids duplicates by checking whether the Telegram message URL (e.g. `https://t.me/iliaen/<id>`) already exists in `public.sources` for that timeline
- auto-reconnects on transient connection drops and continues

## Useful options

- **Dry-run (no DB writes)**

```bash
cd "/Users/thelmi/source/Timeline/web"
node ./scripts/ingest-telegram-channel.mjs \
  --timeline-slug iran-uprise-2026 \
  --channel @iliaen \
  --from 2025-12-27 \
  --only-media \
  --dry-run \
  --max 25
```

- **Cap items while testing**
  - `--max 50`

- **Disable resume**
  - `--no-resume`

- **Explicit end date**
  - `--to 2026-02-14`

## Troubleshooting

- **Login prompts**
  - First run will prompt for a Telegram login code (and optionally 2FA password). A local session is saved in:
    - `web/.telegram-session.txt`

- **“Connection closed” / disconnects**
  - The script auto-reconnects + resumes. If you stop the process, rerun the same command to resume.

