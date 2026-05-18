# Quick Reference: Testing & Endpoints

## Access Points

| Name                | URL                                | Purpose                    |
| ------------------- | ---------------------------------- | -------------------------- |
| Testing Tools       | `http://localhost:3000/test-tools` | Interactive test UI        |
| Providers Dashboard | `http://localhost:3000/providers`  | Real-time quota monitoring |
| Home                | `http://localhost:3000`            | System overview            |

## Test Commands (cURL)

### 1. Reset Provider Quotas

```bash
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_test_'$(date +%s)'",
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "test_script",
    "reason": "Manual test"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "webhookEventId": "webhook_xxx",
  "processedProviders": 8
}
```

### 2. Create Single Lead

```bash
curl -X POST http://localhost:3000/api/leads/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phone": "+11234567890",
    "city": "New York",
    "serviceId": "service_1",
    "description": "Test lead"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "leadId": "lead_xxx"
}
```

### 3. Allocate Lead to Providers

```bash
curl -X POST http://localhost:3000/api/leads/lead_xxx/allocate?serviceId=service_1 \
  -H "Content-Type: application/json"
```

**Expected Response:**

```json
{
  "success": true,
  "assignmentIds": ["assign_1", "assign_2", "assign_3"],
  "allocatedProviders": ["provider_1", "provider_2", "provider_4"]
}
```

### 4. Generate 10 Leads (API)

```bash
curl -X POST http://localhost:3000/api/test/generate-leads \
  -H "Content-Type: application/json" \
  -d '{
    "count": 10,
    "serviceId": "service_1"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "summary": {
    "totalRequests": 10,
    "successful": 10,
    "failed": 0,
    "totalTimeMs": 245,
    "averageTimeMs": 24
  }
}
```

## Database Queries

### View All Providers

```sql
SELECT id, name, email,
  monthlyQuota,
  currentMonthAllocated,
  totalAllocationsAllTime
FROM "Provider"
ORDER BY currentMonthAllocated DESC;
```

### View All Services

```sql
SELECT id, name,
  assignmentsPerLead,
  leadExpiryHours
FROM "Service";
```

### Count Leads by Service

```sql
SELECT
  s."name" as service,
  COUNT(l.id) as total_leads,
  SUM(CASE WHEN l."status" = 'NEW' THEN 1 ELSE 0 END) as new,
  SUM(CASE WHEN l."status" = 'ASSIGNED' THEN 1 ELSE 0 END) as assigned,
  SUM(CASE WHEN l."status" = 'CONVERTED' THEN 1 ELSE 0 END) as converted
FROM "Lead" l
JOIN "Service" s ON l."serviceId" = s.id
GROUP BY s.id, s."name";
```

### View Recent Assignments

```sql
SELECT
  a.id,
  l."customerName",
  p."name" as provider,
  a."status",
  a."createdAt"
FROM "Assignment" a
JOIN "Lead" l ON a."leadId" = l.id
JOIN "Provider" p ON a."providerId" = p.id
ORDER BY a."createdAt" DESC
LIMIT 20;
```

### Check Webhook History

```sql
SELECT
  id,
  "externalId",
  status,
  payload->>'source' as source,
  "createdAt"
FROM "WebhookEvent"
WHERE payload->>'type' = 'quota_reset'
ORDER BY "createdAt" DESC
LIMIT 10;
```

### Reset All Test Data

```bash
# Clear test leads
psql -U postgres -d lead_distribution -c "
  DELETE FROM \"Lead\"
  WHERE \"customerName\" LIKE 'Test Lead%';
"

# Reset provider quotas
psql -U postgres -d lead_distribution -c "
  UPDATE \"Provider\"
  SET \"currentMonthAllocated\" = 0,
      \"monthResetAt\" = NOW();
"
```

## Npm Scripts

```bash
# Start development server
npm run dev

# Run TypeScript compiler check
npx tsc --noEmit

# Run linter
npm run lint

# Prisma commands
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:seed      # Seed test data
npm run prisma:studio    # Open Prisma Studio GUI

# View Prisma Studio (GUI database browser)
npm run prisma:studio
```

## Testing Workflow

### Step 1: Setup

```bash
npm run prisma:migrate   # Create schema
npm run prisma:seed      # Create test data
npm run dev              # Start server
```

### Step 2: Interactive Tests

Go to `http://localhost:3000/test-tools` and click:

1. 💾 Reset Quotas
2. 🔄 Test Idempotency (3x)
3. ⚡ Generate 10 Leads

### Step 3: Verify

- Check `/providers` dashboard
- Monitor real-time updates
- Query database to verify results

### Step 4: Allocation Testing

```bash
# Get a lead ID from test-tools output or database
LEAD_ID="lead_xxx"

# Allocate to providers
curl -X POST "http://localhost:3000/api/leads/$LEAD_ID/allocate?serviceId=service_1"

# Check provider dashboard for updated quotas
```

## Key Metrics to Monitor

During testing, track:

- **Lead creation time**: `averageTimeMs` (should be <50ms)
- **Provider quotas**: Should decrement when leads allocated
- **Webhook idempotency**: Same event ID on retries
- **Real-time updates**: Dashboard refreshes instantly
- **Concurrency**: 10 simultaneous requests all succeed

## Files Generated by Tests

- Leads: 10+ test leads with unique phone numbers
- Webhook events: Records of all quota resets
- Allocations: Assignment records linking leads to providers

## Common Issues & Fixes

| Issue                       | Cause                       | Fix                                             |
| --------------------------- | --------------------------- | ----------------------------------------------- |
| "Service not found"         | Service 1 not seeded        | Run `npm run prisma:seed`                       |
| "Port 3000 in use"          | Dev server already running  | Kill process or use different port              |
| "ECONNREFUSED"              | Database not running        | Ensure PostgreSQL is running                    |
| "Webhook already processed" | Same externalId as before   | Use unique timestamp in externalId              |
| "Duplicate phone"           | Lead with same phone exists | Test uses incremented numbers, should be unique |

## Support

**Files:**

- Database schema: `prisma/schema.prisma`
- API routes: `src/app/api/`
- Services: `src/server/services/`
- Tests: `src/app/test-tools/`

**Documentation:**

- Webhook: `src/server/realtime/WEBHOOK_GUIDE.md`
- Concurrency: `src/server/services/CONCURRENCY_SAFETY_GUIDE.md`
- Allocation: `src/server/services/ALLOCATION_DESIGN.md`
- Testing: `src/server/realtime/TESTING_GUIDE.md`
