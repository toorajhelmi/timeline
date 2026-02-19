FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web

# Install deps for the web workspace (includes @supabase/supabase-js).
COPY web/package.json web/package-lock.json ./
# Railway builds occasionally report lockfile sync issues even when local `npm ci` succeeds.
# For this worker we only need production deps, so prefer a non-strict install.
RUN npm install --omit=dev --no-audit --no-fund

# Copy only what we need to run the worker.
COPY web/scripts ./scripts

ENV NODE_ENV=production

CMD ["node", "scripts/transcode-worker.mjs"]

