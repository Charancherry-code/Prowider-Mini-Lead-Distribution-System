FROM node:20-bookworm-slim AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install system deps
RUN apt-get update -y && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js — DATABASE_URL is only needed at runtime, but env.ts validates
# it at import time, so we pass a dummy value to satisfy the build-time check.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    DIRECT_URL="postgresql://build:build@localhost:5432/build" \
    npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["sh", "scripts/docker-start.sh"]
