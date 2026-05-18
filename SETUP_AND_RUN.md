# Setup & Running Guide

## Quick Start

### Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ running locally
- Environment variables configured

### Step 1: Database Setup

```bash
# Create database if not exists (one time)
psql -U postgres -c "CREATE DATABASE lead_distribution;"

# Run migrations to create schema
npm run prisma:migrate

# Seed test data (3 services, 8 providers)
npm run prisma:seed
```

**Verify:**

```bash
# View database via GUI
npm run prisma:studio
```

### Step 2: Start Development Server

```bash
npm run dev
```

**Expected Output:**

```
> Ready on http://localhost:3000
```

### Step 3: Access the App

| URL                                | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `http://localhost:3000`            | Home page (overview + links) |
| `http://localhost:3000/providers`  | Live provider dashboard      |
| `http://localhost:3000/test-tools` | Interactive testing UI       |

---

## Testing Workflow

### Option 1: Interactive UI (Recommended for Evaluators)

1. Open `http://localhost:3000/test-tools`
2. Click **💾 Reset Quotas** → All providers reset to 0/10
3. Click **🔄 Test Idempotency (3x)** → Verify webhook safety
4. Click **⚡ Generate 10 Leads** → Create concurrent test data
5. Watch `/providers` dashboard for real-time updates

### Option 2: cURL Commands

**Reset quotas:**

```bash
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_test_'$(date +%s)'",
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "test",
    "reason": "Manual test"
  }'
```

**Create a lead:**

```bash
curl -X POST http://localhost:3000/api/leads/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phone": "+11234567890",
    "city": "New York",
    "serviceId": "service_1"
  }'
```

**Allocate lead to providers:**

```bash
LEAD_ID="<from create response>"
curl -X POST "http://localhost:3000/api/leads/$LEAD_ID/allocate?serviceId=service_1"
```

### Option 3: Prisma Studio (Database GUI)

```bash
npm run prisma:studio
```

Opens `http://localhost:5555` with visual database browser:

- Browse all tables
- View records
- Test queries
- Edit data

---

## Troubleshooting

### Error: "Connection refused to localhost:5432"

**Cause:** PostgreSQL not running

**Fix:**

```bash
# macOS (Homebrew)
brew services start postgresql

# Linux (systemctl)
sudo systemctl start postgresql

# Windows
# Start PostgreSQL service from Services app

# Docker (alternative)
docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

### Error: "database \"lead_distribution\" does not exist"

**Fix:**

```bash
# Create database
psql -U postgres -c "CREATE DATABASE lead_distribution;"

# Run migrations
npm run prisma:migrate

# Seed data
npm run prisma:seed
```

### Error: "relations... do not exist"

**Fix:**

```bash
# Run migrations
npm run prisma:migrate
```

### Error: "Service not found" on test-tools

**Fix:**

```bash
# Re-seed data
npm run prisma:seed
```

### "Port 3000 already in use"

**Fix:**

```bash
# Use different port
PORT=3001 npm run dev

# Or kill existing process
lsof -ti:3000 | xargs kill -9  # macOS/Linux
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force  # Windows
```

---

## Database Queries

### Check what got created

```bash
# View all providers with quota status
psql -U postgres -d lead_distribution -c "
  SELECT name, email, monthlyQuota, currentMonthAllocated
  FROM \"Provider\"
  ORDER BY name;
"

# View all test leads
psql -U postgres -d lead_distribution -c "
  SELECT id, \"customerName\", \"customerPhone\", status
  FROM \"Lead\"
  WHERE \"customerName\" LIKE 'Test Lead%'
  LIMIT 20;
"

# View webhook events
psql -U postgres -d lead_distribution -c "
  SELECT \"externalId\", status, \"createdAt\"
  FROM \"WebhookEvent\"
  ORDER BY \"createdAt\" DESC
  LIMIT 10;
"
```

---

## What to Verify

### 1. Database Connectivity ✅

- `npm run prisma:migrate` completes without errors
- `npm run prisma:studio` opens GUI at `http://localhost:5555`

### 2. Dev Server Running ✅

- `npm run dev` shows "Ready on http://localhost:3000"
- Home page loads at `http://localhost:3000`

### 3. Testing UI Works ✅

- `http://localhost:3000/test-tools` loads
- All 3 test buttons are clickable
- Tests complete and show results

### 4. Webhook Idempotency ✅

- Run "Test Idempotency (3x)" button
- All 3 requests return same webhookEventId
- First processes 8 providers, 2nd/3rd process 0 (cached)

### 5. Real-time Dashboard ✅

- Go to `http://localhost:3000/providers`
- See live connection status (green dot = connected)
- Click "Generate 10 Leads" from test-tools
- Dashboard should update automatically

### 6. Concurrency Safety ✅

- Generate 10 leads simultaneously
- All should succeed (status 201)
- No duplicate phone errors
- Dashboard reflects all 10 immediately

---

## Npm Scripts

```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm run start            # Run production build
npm run lint             # Check code style
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:seed      # Seed test data
npm run prisma:studio    # Open Prisma Studio GUI
```

---

## Performance Notes

**Lead Creation:**

- Typical time: ~20-40ms per lead
- Concurrent 10 leads: ~200-400ms total
- Depends on: Database latency, network

**Allocation:**

- Typical time: ~50-100ms per lead
- SERIALIZABLE transaction overhead: ~20-30ms
- Depends on: Provider count, quota checks

**Webhook Processing:**

- Typical time: ~10-20ms
- Idempotency check: <5ms (database lookup)
- Quota reset (8 providers): ~15-30ms

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│             Frontend Layer                           │
├──────────────────────┬──────────────────────────────┤
│ Home Page            │ Provider Dashboard (Real-time)
│ `/`                  │ `/providers` (Socket.IO)
│                      │ Testing Tools `/test-tools`
├─────────────────────────────────────────────────────┤
│             API Layer                                │
├──────────────────────┬──────────────────────────────┤
│ POST /api/leads/create          (Lead creation)
│ POST /api/leads/:id/allocate    (Fair distribution)
│ POST /api/webhooks/quota-reset  (Idempotent)
│ POST /api/test/generate-leads   (Concurrency test)
├─────────────────────────────────────────────────────┤
│             Service Layer                            │
├──────────────────────┬──────────────────────────────┤
│ Lead Creation        │ Provider Allocation
│ Duplicate Prevention │ SERIALIZABLE Transaction
│ Validation           │ Round-robin Distribution
│                      │ Quota Enforcement
├─────────────────────────────────────────────────────┤
│             Data Layer                               │
├──────────────────────┬──────────────────────────────┤
│ PostgreSQL + Prisma
│ 6 Models: Service, Provider, Lead, Assignment,
│           AllocationState, WebhookEvent
└─────────────────────────────────────────────────────┘
```

---

## Support Resources

**Documentation:**

- [WEBHOOK_GUIDE.md](src/server/realtime/WEBHOOK_GUIDE.md) - Webhook idempotency
- [SOCKET_IO_GUIDE.md](src/server/realtime/SOCKET_IO_GUIDE.md) - Real-time updates
- [TESTING_GUIDE.md](src/server/realtime/TESTING_GUIDE.md) - Detailed test guide
- [CONCURRENCY_SAFETY_GUIDE.md](src/server/services/CONCURRENCY_SAFETY_GUIDE.md) - Safety guarantees
- [ALLOCATION_DESIGN.md](src/server/services/ALLOCATION_DESIGN.md) - Algorithm design
- [TESTING_QUICK_REFERENCE.md](TESTING_QUICK_REFERENCE.md) - Quick reference

**Code Structure:**

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── providers/         # Provider dashboard
│   ├── test-tools/        # Testing UI
│   └── page.tsx           # Home page
├── client/
│   ├── components/        # React components
│   └── hooks/             # Custom hooks (useProviderUpdates)
├── server/
│   ├── services/          # Business logic
│   ├── realtime/          # Socket.IO setup
│   ├── db/                # Database client
│   └── utils/             # Helpers
└── config/                # Configuration

prisma/
├── schema.prisma          # Database schema
└── seed.ts                # Test data seeding

server.ts                   # Express + Socket.IO server
```

---

## Next Steps After Setup

1. ✅ Run through all 3 tests in `/test-tools`
2. ✅ Monitor real-time updates in `/providers`
3. ✅ Query database to verify data consistency
4. ✅ Test allocation endpoint with generated leads
5. ✅ Verify quota tracking accuracy
6. ✅ Check webhook idempotency (test again with same externalId)

---

## Questions?

Check the documentation files in `src/server/realtime/` and `src/server/services/` for detailed explanations.
