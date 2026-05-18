# Testing Tools Page

## Overview

The Testing Tools page provides interactive controls for evaluators and developers to test critical system features:

- **Webhook Idempotency**: Verify same webhook event isn't processed twice
- **Quota Reset**: Manually reset provider quotas via webhook
- **Concurrent Lead Generation**: Load test the lead creation endpoint

Access at: `http://localhost:3000/test-tools`

## Test 1: Reset Provider Quotas

### What It Does

Calls the quota reset webhook endpoint once to reset all provider quotas to 0 (making full quota available).

### Expected Result

```json
{
  "success": true,
  "webhookEventId": "webhook_abc123",
  "processedProviders": 8,
  "message": "Reset quotas for 8 providers"
}
```

**Verification:**

- Navigate to `/providers`
- All provider cards should show `0/10` (0 allocated, 10 remaining)
- Dashboard real-time updates should trigger

### Use Case

- Reset environment to clean state between test runs
- Verify quota reset webhook works correctly
- Test dashboard real-time updates

---

## Test 2: Webhook Idempotency (3x)

### What It Does

Sends the **exact same webhook event three times** concurrently using `Promise.all()`:

```typescript
const requests = [1, 2, 3].map(() =>
  fetch("/api/webhooks/quota-reset", {
    method: "POST",
    body: JSON.stringify(payload), // Same payload
  }),
);

const responses = await Promise.all(requests);
```

### Expected Result (Idempotent)

```json
{
  "request_1": {
    "webhookId": "webhook_abc123",
    "processedProviders": 8,
    "message": "Successfully reset quotas"
  },
  "request_2": {
    "webhookId": "webhook_abc123", // ← Same ID!
    "processedProviders": 0, // ← Zero processed (cached)
    "cached": true,
    "message": "Webhook already processed"
  },
  "request_3": {
    "webhookId": "webhook_abc123", // ← Same ID!
    "processedProviders": 0, // ← Zero processed (cached)
    "cached": true,
    "message": "Webhook already processed"
  }
}
```

### Success Criteria

✅ All three requests return `status: 200`
✅ All three have same `webhookEventId`
✅ First request: `processedProviders > 0`
✅ Requests 2-3: `processedProviders === 0` (cached)

### Why This Matters

- Real-world networks fail and retry
- Payment providers retry webhooks on timeout
- System must handle duplicates safely
- This test proves idempotency works

### How Idempotency Works

```
Unique Constraint in Database:
  WebhookEvent { externalId UNIQUE }

Request 1 (externalId="evt_123")
  ├─ Check: Is "evt_123" in database? NO
  ├─ Process: Reset all providers
  ├─ Store: CREATE WebhookEvent { externalId="evt_123" }
  └─ Return: 200 OK, processedProviders=8

Request 2 (externalId="evt_123")  [DUPLICATE]
  ├─ Check: Is "evt_123" in database? YES
  ├─ Return: 200 OK, cached result (processedProviders=0)
  └─ No processing happens

Request 3 (externalId="evt_123")  [DUPLICATE]
  ├─ Check: Is "evt_123" in database? YES
  ├─ Return: 200 OK, cached result (processedProviders=0)
  └─ No processing happens
```

### Use Case

- Verify webhook system is production-safe
- Demonstrate idempotency to auditors
- Test failure recovery

---

## Test 3: Generate 10 Leads (Concurrent)

### What It Does

Creates 10 leads **simultaneously** using `Promise.all()`:

```typescript
const leadRequests = Array.from({ length: 10 }, (_, i) =>
  fetch("/api/leads/create", {
    method: "POST",
    body: JSON.stringify({
      name: `Test Lead ${i + 1}`,
      phone: `+1${String(1000000000 + i).slice(-10)}`,
      city: `City ${i + 1}`,
      serviceId: "service_1",
    }),
  }),
);

const responses = await Promise.all(leadRequests);
```

### Expected Result

```json
{
  "success": true,
  "summary": {
    "totalRequests": 10,
    "successful": 10,
    "failed": 0,
    "totalTimeMs": 245,
    "averageTimeMs": 24
  },
  "results": [
    {
      "index": 1,
      "status": 201,
      "success": true,
      "data": { "leadId": "lead_abc123", ... }
    },
    // ... 9 more results
  ]
}
```

### Success Criteria

✅ `successful === 10`
✅ `failed === 0`
✅ All status codes `201` (created)
✅ All have `leadId`
✅ Total time < 1000ms (depends on DB)

### Performance Insights

- **totalTimeMs**: Total time for all 10 requests (concurrent)
- **averageTimeMs**: Average per request (totalTimeMs / count)
- Lower average = faster database

**Example:**

- 10 leads in 245ms total
- 24.5ms per lead on average
- ~40 leads per second throughput

### What Gets Created

Each lead has:

- **Name**: "Test Lead 1-10"
- **Phone**: "+11000000000", "+11000000001", ... (unique per test)
- **City**: "City 1-10"
- **Service**: service_1
- **Status**: NEW (pending allocation)

### Use Case

- Load testing: Can system handle concurrent requests?
- Duplicate prevention: Each lead has unique phone
- Allocation testing: Leads ready for allocation test
- Dashboard testing: See real-time updates as leads appear

### Verify Results

1. Check dashboard updates in real-time
2. Query database:
   ```sql
   SELECT COUNT(*) FROM "Lead"
   WHERE "serviceId" = 'service_1'
   AND "customerName" LIKE 'Test Lead%'
   ORDER BY "createdAt" DESC LIMIT 10;
   ```

---

## UI Features

### Test Buttons

```
[💾 Reset Quotas]  [🔄 Test Idempotency (3x)]  [⚡ Generate 10 Leads]
```

All buttons:

- Disabled during test execution
- Show immediate feedback
- Display results below

### Result Cards

Each result shows:

- **Status Icon**: ⏳ (pending), ✅ (success), ❌ (error)
- **Test Name**: Which test ran
- **Message**: Result summary
- **Duration**: How long it took (ms)
- **Details**: JSON response data (expandable)

### Color Coding

- 🔵 Blue: Pending
- 🟢 Green: Success
- 🔴 Red: Error

---

## Testing Workflow for Evaluators

### Scenario 1: Verify System Readiness

1. Click **Reset Quotas** → Should see "Reset quotas for 8 providers"
2. Navigate to `/providers` → All cards show `0/10`
3. Click **Generate 10 Leads** → Should see "Created 10 leads"
4. Return to test-tools, click **Test Idempotency** → Should all pass

### Scenario 2: Test Concurrency Safety

1. Click **Generate 10 Leads** multiple times in succession
2. Check `/providers` → No quota errors despite concurrent requests
3. Check database: `SELECT COUNT(*) FROM Lead;` → Count matches
4. No duplicate phone errors

### Scenario 3: Verify Webhook Idempotency

1. Click **Test Idempotency (3x)**
2. Result shows all 3 requests returned same webhookEventId
3. Only first request processed (processedProviders=8)
4. Retries returned cached result (processedProviders=0)

---

## API Endpoints Called

### 1. Reset Quotas

```
POST /api/webhooks/quota-reset
```

### 2. Idempotency Test

```
POST /api/webhooks/quota-reset (x3 concurrent)
```

### 3. Generate Leads

```
POST /api/test/generate-leads
```

## Files Created

- `src/client/components/TestingTools.tsx` - React client component
- `src/app/test-tools/page.tsx` - Next.js page
- `src/app/api/test/generate-leads/route.ts` - API endpoint
- `src/server/realtime/TESTING_GUIDE.md` - This documentation

## Dependencies

**Already in project:**

- Next.js (client component with hooks)
- React (useState)
- TypeScript (full type safety)

**No new dependencies needed** ✅

## Production Considerations

### Security

- This page is unprotected (evaluator tool)
- For production, add authentication:

  ```typescript
  import { headers } from "next/headers";

  export async function POST(request: NextRequest) {
    const auth = headers().get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // ... proceed
  }
  ```

### Rate Limiting

- Consider rate limiting for `/api/test/generate-leads`
- Could create thousands of leads quickly
- In production, restrict to admin users only

### Data Cleanup

- Test leads pollute database over time
- Implement periodic cleanup:
  ```sql
  DELETE FROM "Lead"
  WHERE "customerName" LIKE 'Test Lead%'
  AND "createdAt" < NOW() - INTERVAL '24 hours';
  ```

## Troubleshooting

### "Service not found" Error

- Test uses hardcoded `serviceId: "service_1"`
- Run seed script first: `npm run prisma:seed`
- Verify service exists: `SELECT * FROM "Service" WHERE id='service_1';`

### "No providers" Error

- Seed script creates 8 providers
- Run: `npm run prisma:seed`
- Check database: `SELECT COUNT(*) FROM "Provider";`

### "Connection refused"

- Server not running: `npm run dev`
- Check port 3000 is available
- Verify `NEXT_PUBLIC_APP_URL` in `.env.local`

### Webhook Already Processed Error

- Normal on second test run with same externalId
- Clear externalId by using different timestamp
- Or wait 5 minutes for new minute boundary

---

## Next Steps for Evaluators

1. ✅ Run all three tests from this page
2. ✅ Verify dashboard updates in real-time (`/providers`)
3. ✅ Check database for created data
4. ✅ Test allocation endpoint with generated leads
5. ✅ Verify quota tracking works correctly

Access: `http://localhost:3000/test-tools`
