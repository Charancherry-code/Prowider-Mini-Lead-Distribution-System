# Prowider Mini Lead Distribution System

Full-stack assignment implementation: **Next.js 15**, **PostgreSQL**, **Prisma**, **Socket.IO**.

## Live demo

Deploy with Docker (see below) or host on [Vercel](https://vercel.com) + [Neon](https://neon.tech) PostgreSQL.  
**Add your deployed URL here after publishing**, e.g. `https://your-app.vercel.app`

## Quick start

### Docker (recommended)

```bash
docker compose up --build
```

- App: http://localhost:3000  
- Customer form: http://localhost:3000/request-service  
- Dashboard: http://localhost:3000/dashboard  
- Test tools: http://localhost:3000/test-tools  

### Local

```bash
cp .env.example .env.local
# Start PostgreSQL, then:
npm install
npx prisma db push
npm run prisma:seed
npm run dev
```

## Routes

| Route | Purpose |
|-------|---------|
| `/request-service` | Public customer enquiry form |
| `/dashboard` | Provider quota, counts, assigned leads (real-time) |
| `/test-tools` | Quota webhook, idempotency, 10 concurrent leads |

## Allocation algorithm

For each new lead (by service name from seed):

1. **Mandatory providers** are selected first (if they have remaining monthly quota).
2. **Fair pool** fills remaining slots using **round-robin** on `AllocationState.lastProviderIndex` (persisted in PostgreSQL).
3. Exactly **3** providers per lead; same provider never twice on one lead (`@@unique([leadId, providerId])`).

| Service | Mandatory | Fair pool (round-robin) |
|---------|-----------|-------------------------|
| Service 1 | Provider 1 | Providers 2, 3, 4 (pick 2) |
| Service 2 | Provider 5 | Providers 6, 7, 8 (pick 2) |
| Service 3 | Providers 1 & 4 | Providers 2, 3, 5, 6, 7, 8 (pick 1) |

## Concurrency handling

- Allocation runs in a **`SERIALIZABLE`** Prisma transaction.
- `AllocationState` row is locked with **`SELECT … FOR UPDATE`** so concurrent leads serialize per service.
- Provider quota is checked inside the same transaction before assignments are created.
- Duplicate phone per service is blocked by DB unique index `(serviceId, customerPhone)`.

## Webhook idempotency

`POST /api/webhooks/quota-reset` accepts `externalId`. The first request resets all providers’ `currentMonthAllocated` to `0` (10 leads remaining). Retries with the same `externalId` return **200** with `isDuplicate: true` and `processedProviders: 0` without double-resetting. Quota reset is **only** exposed via this webhook (test panel calls it; normal UI does not).

## Submission checklist

- [x] PostgreSQL persistence  
- [x] `/request-service` with auto-assignment  
- [x] `/dashboard` with real-time updates  
- [x] `/test-tools` for evaluator tests  
- [ ] GitHub repository URL (push this project)  
- [ ] Live demo URL (after deploy)

## Scripts

```bash
npm run dev          # Dev server + Socket.IO
npm run build        # Production build
npm run start        # Production server
npm run prisma:seed  # 3 services, 8 providers, allocation state
```

Further detail: `SETUP_AND_RUN.md`, `src/server/services/CONCURRENCY_SAFETY_GUIDE.md`.
