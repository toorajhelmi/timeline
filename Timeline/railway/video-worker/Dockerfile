FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web

# Install deps for the web workspace (includes @supabase/supabase-js).
COPY web/package.json web/package-lock.json ./
RUN npm ci --omit=dev

# Copy only what we need to run the worker.
COPY web/scripts ./scripts

ENV NODE_ENV=production

CMD ["node", "scripts/transcode-worker.mjs"]

