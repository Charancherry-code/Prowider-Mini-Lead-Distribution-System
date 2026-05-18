<div align="center">

# 🚀 Prowider — Mini Lead Distribution System

**A production-grade lead capture and intelligent provider allocation platform**  
*Built for the Prowider Full Stack Developer Assessment*

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.9-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=for-the-badge&logo=socket.io)](https://socket.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com/)

<br/>

[**🌐 Live Demo**](https://provider-production-28fd.up.railway.app) &nbsp;|&nbsp;
[**📋 Request Service**](https://provider-production-28fd.up.railway.app/request-service) &nbsp;|&nbsp;
[**📊 Dashboard**](https://provider-production-28fd.up.railway.app/dashboard) &nbsp;|&nbsp;
[**🧪 Test Tools**](https://provider-production-28fd.up.railway.app/test-tools)

</div>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Live Demo](#-live-demo)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Database Schema](#-database-schema)
- [Allocation Algorithm](#-allocation-algorithm)
- [Concurrency Strategy](#-concurrency-strategy)
- [Webhook Idempotency](#-webhook-idempotency)
- [API Reference](#-api-reference)
- [Features](#-features)
- [Quick Start](#-quick-start)
- [Deployment](#-deployment)
- [Evaluation Criteria](#-evaluation-criteria)

---

## 🧭 Overview

This system simulates a real-world lead generation and distribution platform. When a customer submits a service enquiry:

1. The lead is **persisted** to PostgreSQL with full validation
2. The system **automatically assigns exactly 3 providers** per lead — following mandatory business rules and a fair round-robin algorithm
3. Provider **monthly quotas are enforced** at the database level
4. The provider **dashboard updates in real-time** via Socket.IO — no page refresh needed
5. A **webhook endpoint** handles quota resets with full **idempotency** guarantees

> This is intentionally backend-focused. The emphasis is on correctness, consistency under concurrency, and reliability — not UI aesthetics.

---

## 🌐 Live Demo

**🚀 App is live at:** https://provider-production-28fd.up.railway.app

| Page | URL | Purpose |
|------|-----|---------|
| Home | https://provider-production-28fd.up.railway.app/ | Navigation hub |
| Customer Form | https://provider-production-28fd.up.railway.app/request-service | Submit service enquiries |
| Provider Dashboard | https://provider-production-28fd.up.railway.app/dashboard | Live quota & lead tracking |
| Test Tools | https://provider-production-28fd.up.railway.app/test-tools | Webhook & concurrency tests |

---

## 🛠 Tech Stack

| Category | Technology | Reason |
|----------|-----------|--------|
| Framework | Next.js 15 (App Router) | Full-stack React, API routes co-located |
| Language | TypeScript 5 | End-to-end type safety |
| Database | PostgreSQL 16 | ACID transactions, row-level locking |
| ORM | Prisma 6.9 | Type-safe queries, migrations, seed |
| Real-time | Socket.IO 4.8 | Persistent WebSocket for live dashboard |
| Validation | Zod 4 | Runtime schema validation (env + API inputs) |
| Styling | Tailwind CSS v4 | Utility-first, rapid UI |
| Runtime | Node.js 20 + tsx | Custom HTTP server for Socket.IO attach |
| Container | Docker + Compose | One-command local setup |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         server.ts                               │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │    Next.js App Router    │  │     Socket.IO Server         │ │
│  │  (API routes + pages)    │  │  (same HTTP port, /socket.io)│ │
│  └──────────┬───────────────┘  └──────────────┬───────────────┘ │
└─────────────┼────────────────────────────────┼─────────────────┘
              │                                │
              ▼                                ▼
   ┌──────────────────┐            ┌──────────────────────┐
   │  Prisma Client   │            │  global.socketServer │
   │  (PostgreSQL 16) │            │  .emit("dashboard:   │
   └──────────────────┘            │    updated", payload)│
                                   └──────────────────────┘

  Request Flow:
  ─────────────
  POST /api/leads/create
       │
       ├─► validateCreateLeadRequest()   [Zod]
       │
       ├─► prisma.lead.create()          [PostgreSQL]
       │
       ├─► allocateLeadToProviders()     [Transaction + FOR UPDATE lock]
       │     ├─► Check mandatory providers → quota check
       │     ├─► Round-robin fair pool   → persist lastProviderIndex
       │     ├─► Create 3 Assignments
       │     └─► Update provider quotas
       │
       └─► emitDashboardUpdated()        [Socket.IO broadcast]
```

---

## 🗄 Database Schema

```
Service ──────────── Lead ──────────── Assignment ──────── Provider
   │                  │                     │
   │                  │                     └── WebhookEvent
   └─ AllocationState └── (serviceId, customerPhone) UNIQUE
                           (leadId, providerId) UNIQUE
```

### Models at a Glance

| Model | Key Fields | Purpose |
|-------|-----------|---------|
| `Service` | `name UNIQUE`, `assignmentsPerLead`, `leadExpiryHours` | The 3 service types |
| `Provider` | `email UNIQUE`, `monthlyQuota`, `currentMonthAllocated` | 8 providers with quota tracking |
| `Lead` | `(serviceId, customerPhone) UNIQUE`, `status`, `assignmentCount` | Customer enquiries |
| `Assignment` | `(leadId, providerId) UNIQUE`, `status`, `expiresAt` | Provider↔Lead mapping |
| `AllocationState` | `lastProviderIndex`, `providerAllocationOrder` | Round-robin cursor per service |
| `QuotaResetWebhook` | `externalId UNIQUE`, `isDuplicate`, `processedProviders` | Webhook idempotency log |

### Critical DB Constraints

```sql
-- Prevent duplicate leads: same customer, same service
@@unique([serviceId, customerPhone])   -- on Lead

-- Prevent same provider getting same lead twice
@@unique([leadId, providerId])         -- on Assignment

-- Webhook idempotency key
externalId @unique                     -- on QuotaResetWebhook
```

---

## ⚙️ Allocation Algorithm

### Business Rules

| Service | Mandatory (always receive) | Fair Pool (round-robin) | Slots from Pool |
|---------|--------------------------|------------------------|-----------------|
| Service 1 | Provider 1 | Providers 2, 3, 4 | 2 |
| Service 2 | Provider 5 | Providers 6, 7, 8 | 2 |
| Service 3 | Providers 1 & 4 | Providers 2, 3, 5, 6, 7, 8 | 1 |

### How It Works (Step-by-Step)

```
For each new lead:

1. LOCK AllocationState row (SELECT … FOR UPDATE)
   └─ Prevents concurrent allocations from corrupting round-robin state

2. MANDATORY PHASE
   └─ For each mandatory provider: check monthlyQuota vs currentMonthAllocated
   └─ If any mandatory provider is at quota → return MANDATORY_PROVIDER_QUOTA_EXCEEDED

3. FAIR POOL PHASE
   └─ Load providerAllocationOrder (JSON array, persisted in DB)
   └─ Start from lastProviderIndex + 1, iterate round-robin
   └─ Skip providers: already selected, quota exhausted
   └─ Pick required number of fair-pool slots

4. VALIDATE
   └─ Must have exactly 3 total providers → else return NO_AVAILABLE_PROVIDERS

5. ATOMICALLY WRITE
   ├─ Create 3 Assignment rows
   ├─ Increment currentMonthAllocated + totalAllocationsAllTime for each provider
   ├─ Update Lead.status = ASSIGNED, assignmentCount = 3
   └─ Persist new lastProviderIndex to AllocationState

6. EMIT REAL-TIME EVENT
   └─ emitDashboardUpdated({ leadId, allocatedProviders, timestamp })
```

### Why Round-Robin Instead of Random?

| Property | Round-Robin ✅ | Random ❌ |
|----------|--------------|---------|
| Fairness guarantee | Equal distribution over time | Statistically fair, practically unequal |
| Persists after restart | Yes (DB-backed cursor) | N/A — stateless |
| Predictable for testing | Yes | No |
| Audit trail | `lastProviderIndex` shows exactly where we are | No |

---

## 🔒 Concurrency Strategy

### The Problem
Multiple leads created simultaneously could all read the same `lastProviderIndex` and advance it independently — resulting in the same provider being picked for multiple leads, breaking fairness.

### The Solution

```typescript
// 1. Row-level lock — acquired BEFORE reading AllocationState
await tx.$executeRaw`
  SELECT 1 FROM "AllocationState" WHERE "serviceId" = ${serviceId} FOR UPDATE
`;

// 2. Retry loop for Postgres serialization conflicts
const MAX_ALLOCATION_RETRIES = 8;
for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt++) {
  try {
    return await runAllocationTransaction(leadId, serviceId);
  } catch (error) {
    if (isRetryableError(error) && attempt < MAX_ALLOCATION_RETRIES - 1) {
      // Exponential back-off with jitter: 25ms * (attempt+1) + random(0-20ms)
      await sleep(25 * (attempt + 1) + Math.floor(Math.random() * 20));
      continue;
    }
    break;
  }
}
```

**What this guarantees:**
- Only **one transaction** at a time can hold the lock on a service's `AllocationState`
- All others queue behind it — each seeing the updated `lastProviderIndex`
- Postgres `P2034` (write conflict) and `P2010` errors trigger automatic retries
- The DB unique constraint `(serviceId, customerPhone)` is the final safety net for duplicate leads

---

## 🔁 Webhook Idempotency

### The Problem
Payment providers retry webhooks on network failure. A naive implementation would reset provider quotas multiple times for the same billing event.

### The Solution

```
POST /api/webhooks/quota-reset
  Body: { externalId: "evt_abc123", eventType: "quota_reset", ... }

  Transaction:
  ┌─────────────────────────────────────────────────────────┐
  │ 1. SELECT FROM QuotaResetWebhook WHERE externalId = ?   │
  │    ├─ EXISTS?  → return { isDuplicate: true,            │
  │    │              processedProviders: 0 }               │
  │    └─ NEW?  ─┐                                          │
  │              ▼                                          │
  │ 2. UPDATE Provider SET currentMonthAllocated = 0        │
  │ 3. INSERT QuotaResetWebhook { externalId, ... }         │
  │    └─ return { isDuplicate: false, processedProviders: N}│
  └─────────────────────────────────────────────────────────┘
```

**First call:** Resets all 8 providers → `{ processedProviders: 8, isDuplicate: false }`  
**Any retry with same `externalId`:** → `{ processedProviders: 0, isDuplicate: true }` — no double reset

The entire check + reset is **wrapped in a single Prisma transaction** — no race condition possible.

---

## 📡 API Reference

### `GET /api/services`
Returns all seeded services for the enquiry form dropdown.

```json
{ "success": true, "data": [{ "id": "clx...", "name": "Service 1", "assignmentsPerLead": 3 }] }
```

---

### `POST /api/leads/create`
Creates a lead and triggers automatic provider allocation.

**Request:**
```json
{
  "name": "Jane Doe",
  "phone": "9999999999",
  "city": "Mumbai",
  "serviceId": "clx...",
  "description": "Optional details"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "leadId": "clx...",
    "assignmentIds": ["clx...", "clx...", "clx..."],
    "allocatedProviders": ["clx...", "clx...", "clx..."]
  }
}
```

**Error codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `DUPLICATE_LEAD` | 400 | Same phone + service already exists |
| `NO_AVAILABLE_PROVIDERS` | 409 | All fair-pool providers at quota |
| `MANDATORY_PROVIDER_QUOTA_EXCEEDED` | 409 | Mandatory provider at monthly limit |
| `SERVICE_NOT_FOUND` | 404 | Invalid serviceId |

---

### `GET /api/providers/dashboard`
Returns all providers with quota stats and recent assigned leads.

---

### `POST /api/webhooks/quota-reset`
Idempotent webhook to reset all provider monthly quotas.

**Request:**
```json
{
  "externalId": "evt_billing_cycle_202506",
  "eventType": "quota_reset",
  "timestamp": 1716000000,
  "source": "payment_provider",
  "reason": "Monthly billing cycle"
}
```

---

### `POST /api/test/generate-leads`
Generates N leads concurrently (in-process) for stress testing.

```json
{ "count": 10, "serviceId": "clx..." }
```

---

### `GET /api/health`
```json
{ "ok": true, "service": "lead-distribution" }
```

---

## ✨ Features

### Feature 1 — Customer Enquiry Form (`/request-service`)
- Fields: Name, Phone, City, Service Type (DB-loaded dropdown), Description
- Duplicate prevention enforced at **PostgreSQL level** (`@@unique` constraint), not just frontend
- Shows inline success/error feedback after submission

### Feature 2 — Intelligent Lead Distribution
- Exactly **3 providers** assigned per lead — no more, no less
- Mandatory providers receive every lead for their service (quota permitting)
- Remaining slots filled via **persisted round-robin** — fair across restarts
- Same provider **never assigned the same lead twice** (DB unique constraint)
- Full **concurrency safety** under simultaneous lead creation

### Feature 3 — Provider Dashboard (`/dashboard`)
- Per-provider quota progress bar (green → amber → red as quota fills)
- Assignment count (this month + all-time)
- Scrollable list of assigned leads with customer details, city, service name
- `/providers` redirects to `/dashboard` for convenience

### Feature 4 — Real-Time Updates
- Built with **Socket.IO** on a custom Node.js HTTP server (same port as Next.js)
- Dashboard listens for `dashboard:updated` events and re-fetches immediately
- Live **connection indicator** (green = connected, amber = reconnecting)
- Automatic reconnect with configurable delay and max attempts

### Feature 5 — Test Tools Panel (`/test-tools`)
| Button | What It Tests | API Called |
|--------|--------------|-----------|
| 💾 Reset Quotas | Basic webhook processing | `POST /api/webhooks/quota-reset` |
| 🔄 Test Idempotency (3×) | Same `externalId` sent 3 times concurrently | Same endpoint |
| ⚡ Generate 10 Leads | Concurrent allocation under load | `POST /api/test/generate-leads` |

---

## ⚡ Quick Start

### Option 1: View Live Demo (Instant)

**🚀 Live app:** https://provider-production-28fd.up.railway.app

No setup required — click and explore all features immediately.

---

### Option 2: Run Locally with Docker (5 minutes)

**Prerequisites:** Docker and Docker Compose installed

```bash
# 1. Clone the repository
git clone https://github.com/Charancherry-code/Prowider-Mini-Lead-Distribution-System.git
cd Prowider-Mini-Lead-Distribution-System

# 2. Start the application (one command)
docker compose up --build
```

**That's it!** Docker will automatically:
1. Start PostgreSQL 16 database
2. Wait for database health check
3. Apply database schema (`prisma db push`)
4. Seed test data (3 services, 8 providers)
5. Start the development server with hot reload

**Access the app:**
| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Home page |
| http://localhost:3000/request-service | Submit service enquiries |
| http://localhost:3000/dashboard | Real-time provider dashboard |
| http://localhost:3000/test-tools | Test webhook & concurrency |

**To stop:** `Ctrl+C` then `docker compose down`

---

### Option 3: Production Docker Build (Evaluators)

For testing the production Docker image (same as deployed on Railway):

```bash
# 1. Clone repository
git clone https://github.com/Charancherry-code/Prowider-Mini-Lead-Distribution-System.git
cd Prowider-Mini-Lead-Distribution-System

# 2. Create production environment file
cp .env.example .env.local
# Edit .env.local with your database URL (or use the docker-compose setup below)

# 3. Build production image
docker build -t prowider-app .

# 4. Run with PostgreSQL
docker run -d --name postgres-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=lead_distribution \
  -p 5432:5432 \
  postgres:16-alpine

# Wait 10 seconds for DB to start, then:
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/lead_distribution?schema=public" \
  -e DIRECT_URL="postgresql://postgres:postgres@host.docker.internal:5432/lead_distribution?schema=public" \
  -e NEXT_PUBLIC_APP_URL="http://localhost:3000" \
  -e SOCKET_IO_PATH="/socket.io" \
  -e PORT="3000" \
  -e NODE_ENV="production" \
  prowider-app
```

**Or use the simpler docker-compose approach above** — it handles networking automatically.

---

### Local Development (Manual Setup)

**Prerequisites:** Node.js 20+, PostgreSQL 16 running locally

```bash
# 1. Clone and install dependencies
git clone https://github.com/Charancherry-code/Prowider-Mini-Lead-Distribution-System.git
cd Prowider-Mini-Lead-Distribution-System
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — set your DATABASE_URL to your local PostgreSQL instance

# 3. Setup database
npx prisma db push    # Apply schema
npm run prisma:seed   # Seed test data

# 4. Start development server
npm run dev           # Runs on http://localhost:3000
```

**Note:** The app uses a custom `server.ts` that combines Next.js + Socket.IO on the same port. Use `npm run dev`, not `next dev`.

---

### Available Scripts

```bash
npm run dev           # Start dev server (tsx watch server.ts)
npm run build         # Production Next.js build
npm run start         # Start production server
npm run prisma:seed   # Seed 3 services, 8 providers, allocation states
npm run prisma:studio # Open Prisma Studio (visual DB browser)
npm run lint          # ESLint
```

---

## 🚀 Deployment

> ⚠️ **Do NOT deploy to Vercel.** This project uses a custom `server.ts` with Socket.IO. Vercel's serverless functions cannot maintain persistent WebSocket connections.

### Deploy to Railway (Recommended)

**✅ Already deployed at:** https://provider-production-28fd.up.railway.app

To deploy your own instance:

```bash
# 1. Push to GitHub
git push -u origin main

# 2. Go to railway.app → New Project → Deploy from GitHub
# 3. Add PostgreSQL plugin
# 4. Set environment variables (see below)
# 5. Railway auto-runs docker-start.sh → schema + seed + server
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"
DIRECT_URL="postgresql://user:pass@host:5432/dbname?schema=public"
NEXT_PUBLIC_APP_URL="https://provider-production-28fd.up.railway.app"
SOCKET_IO_PATH="/socket.io"
PORT="3000"
NODE_ENV="production"
```

### Other Platforms

| Platform | Support | Notes |
|----------|---------|-------|
| **Railway** | ✅ Full | Docker-native, PostgreSQL plugin |
| **Render** | ✅ Full | Docker Web Service + Render Postgres |
| **Fly.io** | ✅ Full | `fly launch` with Dockerfile |
| **Vercel** | ❌ | Serverless — Socket.IO won't work |
| **Netlify** | ❌ | Serverless — same issue |

---

## 📊 Evaluation Criteria

| Criterion | Implementation |
|-----------|---------------|
| ✅ **Correct provider allocation** | Mandatory rules + round-robin fair pool, enforced atomically |
| ✅ **Data consistency under concurrency** | `SELECT FOR UPDATE` row lock + 8-retry exponential back-off |
| ✅ **Webhook safety & idempotency** | `externalId UNIQUE` + transactional check before any writes |
| ✅ **Real-time dashboard** | Socket.IO WebSocket, same-port custom HTTP server |
| ✅ **Database design quality** | Unique constraints at DB level, indexed for performance |
| ✅ **Code clarity** | Layered architecture: services → API routes → components |

---

## 📁 Project Structure

```
├── server.ts                          # Entry point: Next.js + Socket.IO
├── prisma/
│   ├── schema.prisma                  # All models, enums, indexes
│   └── seed.ts                        # 3 services, 8 providers, allocation state
├── src/
│   ├── config/env.ts                  # Zod-validated env vars
│   ├── app/
│   │   ├── api/
│   │   │   ├── leads/create/          # POST — create & allocate lead
│   │   │   ├── leads/[id]/allocate/   # POST — re-allocate existing lead
│   │   │   ├── providers/dashboard/   # GET  — dashboard data
│   │   │   ├── services/              # GET  — list services
│   │   │   ├── webhooks/quota-reset/  # POST — idempotent quota reset
│   │   │   ├── test/generate-leads/   # POST — concurrent lead stress test
│   │   │   └── health/                # GET  — health check
│   │   ├── request-service/           # /request-service page
│   │   ├── dashboard/                 # /dashboard page
│   │   ├── test-tools/                # /test-tools page
│   │   └── providers/                 # Redirects → /dashboard
│   ├── client/
│   │   ├── components/
│   │   │   ├── RequestServiceForm.tsx # Customer enquiry form
│   │   │   ├── ProvidersDashboard.tsx # Real-time provider dashboard
│   │   │   └── TestingTools.tsx       # Test runner UI
│   │   └── hooks/
│   │       └── useProviderUpdates.ts  # Socket.IO client hook
│   └── server/
│       ├── db/prisma.ts               # Prisma singleton
│       ├── realtime/
│       │   ├── socket.ts              # Socket.IO server + emit helper
│       │   └── events.ts              # Event name constants + types
│       ├── services/
│       │   ├── allocation-rules.ts          # Business rules config
│       │   ├── lead-create-service.ts       # Lead creation flow
│       │   ├── provider-allocation-service.ts # Core allocation algorithm
│       │   ├── provider-dashboard-service.ts  # Dashboard data query
│       │   └── quota-reset-service.ts         # Idempotent quota reset
│       └── utils/
│           └── lead-validation.ts     # Zod schema for lead input
└── scripts/
    ├── docker-start.sh                # DB push + seed + server + warm-up
    └── run-all-tests.ps1              # PowerShell test suite
```

---

## 🧪 Running Tests

```powershell
# Full automated test suite (PowerShell)
powershell -File scripts/run-all-tests.ps1
```

**Manual test scenarios:**

```bash
# 1. Duplicate lead (expect 400)
curl -X POST http://localhost:3000/api/leads/create \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"9999999999","city":"Delhi","serviceId":"<id>"}'

# Send same phone + serviceId again → should get DUPLICATE_LEAD

# 2. Webhook idempotency (send twice with same externalId)
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{"externalId":"evt_test_001","eventType":"quota_reset","timestamp":1716000000,"source":"test"}'
# First: processedProviders=8, isDuplicate=false
# Second: processedProviders=0, isDuplicate=true ✅
```

---

<div align="center">

**Built with precision for the Prowider Full Stack Developer Assessment**

*Focused on correctness, reliability, and real-world backend engineering.*

</div>
