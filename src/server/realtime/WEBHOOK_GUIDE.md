# Webhook Endpoint: Quota Reset

## Overview

Production-grade webhook endpoint for resetting provider quotas with guaranteed idempotency.

## Key Features

✅ **Idempotency**: Same webhook ID can be replayed safely
✅ **Atomic Transactions**: All providers updated atomically
✅ **Type Safety**: Zod validation + TypeScript types
✅ **Error Handling**: Detailed error responses
✅ **Audit Trail**: All webhooks stored in database

## Architecture

```
Payment Provider
    ↓
POST /api/webhooks/quota-reset (with externalId)
    ↓
Validate payload (Zod schema)
    ↓
Check idempotency (externalId lookup)
    ├─ If duplicate: Return 200 OK (cached)
    └─ If new: Process in transaction
    ↓
Reset all providers: currentMonthAllocated = 0
Update monthResetAt timestamp
Store webhook event record
    ↓
Return 200 OK
```

## Idempotency Strategy

### Why It Matters

- Network failures cause retries
- Webhook provider may send same event multiple times
- We must handle duplicates safely without side effects

### How It Works

1. **External ID**: Payment provider sends unique `externalId` for each webhook send

   ```
   evt_1234567890abc
   evt_1234567891xyz  (different webhook)
   evt_1234567890abc  (retry of first webhook)
   ```

2. **Unique Constraint**: Database has `@unique` on externalId

   ```prisma
   externalId String @unique(map: "idx_unique_webhook_external_id")
   ```

3. **Idempotent Response**: Always return 200 OK
   - First request: Processes webhook, stores record, returns 200
   - Retry (same externalId): Finds existing record, returns 200 cached response
   - No duplicate processing occurs

4. **Transaction Atomicity**: All updates happen or none
   ```typescript
   $transaction([
     // All or nothing
     updateMany(Provider), // Reset all quotas
     create(WebhookEvent), // Record webhook
   ]);
   ```

## Request/Response

### Endpoint

```
POST /api/webhooks/quota-reset
Content-Type: application/json
```

### Request Body

```json
{
  "externalId": "evt_monthly_reset_2026_05_18",
  "eventType": "quota_reset",
  "timestamp": 1716000000,
  "source": "payment_provider",
  "reason": "Monthly billing cycle ended"
}
```

**Fields:**

- `externalId` (required): Unique ID from payment provider (use for idempotency)
- `eventType` (required): Must be `"quota_reset"`
- `timestamp` (required): Unix timestamp when event occurred
- `source` (required): Origin identifier (e.g., "payment_provider", "admin_portal")
- `reason` (optional): Human-readable reason for reset

### Success Response (200 OK)

```json
{
  "success": true,
  "webhookEventId": "webhook_1234567890",
  "processedProviders": 8,
  "message": "Successfully reset quotas for 8 providers"
}
```

**On Idempotent Retry (same externalId):**

```json
{
  "success": true,
  "message": "Webhook already processed (returning cached result)",
  "webhookEventId": "webhook_1234567890"
}
```

### Error Response (400 Bad Request)

```json
{
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "path": ["externalId"],
      "message": "Expected string, received undefined"
    }
  ]
}
```

### Error Response (500 Internal Server Error)

```json
{
  "error": "DATABASE_ERROR",
  "message": "Connection pool exhausted"
}
```

## Database Flow

### Step 1: Check Idempotency

```typescript
const existingEvent = await tx.webhookEvent.findUnique({
  where: { externalId: payload.externalId },
  select: { id: true, status: true },
});

if (existingEvent) {
  return { isDuplicate: true, webhookEventId: existingEvent.id };
}
```

**Result:**

- Duplicate found → Return cached ID
- No duplicate → Continue to Step 2

### Step 2: Reset Provider Quotas

```typescript
const updateResult = await tx.provider.updateMany({
  data: {
    currentMonthAllocated: 0, // Reset to 0
    monthResetAt: new Date(), // Record when reset
  },
});
```

**Affects all providers:**

- Sets `currentMonthAllocated` to 0 (they now have full quota available)
- Records `monthResetAt` timestamp (for auditing)
- Example: If provider had 8/10 allocated, now has 0/10

### Step 3: Store Webhook Event

```typescript
const webhookEvent = await tx.webhookEvent.create({
  data: {
    externalId: payload.externalId, // Ensures uniqueness
    assignmentId: "quota_reset_meta", // Marker for quota events
    eventType: "ASSIGNMENT_CREATED", // Repurposed enum
    status: "SUCCESS",
    payload: {
      type: "quota_reset",
      source: payload.source,
      reason: payload.reason,
      timestamp: payload.timestamp,
      providersReset: updateResult.count,
    },
    succeededAt: new Date(),
  },
});
```

**Provides audit trail:**

- When reset occurred (`createdAt`)
- Who triggered it (`source`)
- Why (`reason`)
- How many providers affected (`providersReset`)

## Test Examples

### Test 1: First Webhook (Success)

```bash
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_monthly_reset_2026_05_18",
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "payment_provider",
    "reason": "Monthly cycle ended"
  }'
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "webhookEventId": "webhook_abc123",
  "processedProviders": 8,
  "message": "Successfully reset quotas for 8 providers"
}
```

### Test 2: Idempotent Retry (Same externalId)

```bash
# Send exact same webhook again
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_monthly_reset_2026_05_18",
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "payment_provider",
    "reason": "Monthly cycle ended"
  }'
```

**Expected Response (200 OK - cached):**

```json
{
  "success": true,
  "message": "Webhook already processed (returning cached result)",
  "webhookEventId": "webhook_abc123"
}
```

**Important:**

- `processedProviders` is 0 (didn't process again)
- Same `webhookEventId` returned
- Response is deterministic (safe to retry forever)

### Test 3: Missing Field (Validation Error)

```bash
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "payment_provider"
    # Missing externalId
  }'
```

**Expected Response (400 Bad Request):**

```json
{
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "path": ["externalId"],
      "message": "Expected string, received undefined"
    }
  ]
}
```

### Test 4: Wrong Event Type (Validation Error)

```bash
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_test_123",
    "eventType": "wrong_type",
    "timestamp": '$(date +%s)',
    "source": "payment_provider"
  }'
```

**Expected Response (400 Bad Request):**

```json
{
  "error": "VALIDATION_ERROR",
  "details": [
    {
      "code": "invalid_enum_value",
      "path": ["eventType"],
      "message": "Invalid enum value. Expected 'quota_reset'"
    }
  ]
}
```

### Test 5: Different externalIds (Sequential Webhooks)

```bash
# First webhook
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_reset_001",
    "eventType": "quota_reset",
    "timestamp": '$(date +%s)',
    "source": "payment_provider"
  }'

# Second webhook (different externalId) - should also process
curl -X POST http://localhost:3000/api/webhooks/quota-reset \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "evt_reset_002",
    "eventType": "quota_reset",
    "timestamp": '$(($(date +%s) + 3600))',
    "source": "payment_provider"
  }'
```

**Expected:**

- First: 200 OK, `processedProviders: 8`
- Second: 200 OK, `processedProviders: 8` (reset again)
- Both webhooks stored in database with different externalIds

## SQL Queries

### View All Quota Reset Webhooks

```sql
SELECT
  id,
  "externalId",
  status,
  payload,
  "createdAt"
FROM "WebhookEvent"
WHERE payload->>'type' = 'quota_reset'
ORDER BY "createdAt" DESC
LIMIT 10;
```

### View Recent Provider Quota Resets

```sql
SELECT
  id,
  name,
  email,
  "monthlyQuota",
  "currentMonthAllocated",
  "monthResetAt"
FROM "Provider"
ORDER BY "monthResetAt" DESC
LIMIT 5;
```

### Count Quota Resets by Source

```sql
SELECT
  payload->>'source' as source,
  COUNT(*) as reset_count
FROM "WebhookEvent"
WHERE payload->>'type' = 'quota_reset'
GROUP BY payload->>'source'
ORDER BY reset_count DESC;
```

## Idempotency in Action

### Scenario: Network Retry

```
T1: Payment provider sends evt_123
    → Webhook endpoint receives
    → Resets all providers
    → Stores webhook event
    → Returns 200 OK

T2: Payment provider doesn't receive response (network timeout)
    → Retries with same evt_123
    → Webhook endpoint receives
    → Checks externalId: found!
    → Returns 200 OK (cached)
    → ✅ Providers NOT reset again (idempotent)

T3: Provider retries again with evt_123
    → Same flow as T2
    → Safe to retry infinite times
```

## Production Deployment Checklist

- [ ] Database has unique constraint on `WebhookEvent.externalId`
- [ ] Run migrations: `npm run prisma:migrate`
- [ ] Configure webhook URL in payment provider settings
- [ ] Add authentication (e.g., signature verification) to route
- [ ] Add rate limiting to prevent abuse
- [ ] Set up monitoring/alerting on webhook failures
- [ ] Test idempotency with network failures
- [ ] Document webhook retry policy for team

## Security Considerations

### Current Implementation

- No authentication (for testing)
- No request signing

### Production Recommendations

```typescript
import crypto from "crypto";

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return hash === signature;
}
```

Add to request validation:

```typescript
const signature = request.headers.get("x-webhook-signature");
if (!verifyWebhookSignature(body, signature, process.env.WEBHOOK_SECRET)) {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
}
```

## Files Created

- `src/server/services/quota-reset-service.ts` - Webhook processing logic
- `src/app/api/webhooks/quota-reset/route.ts` - API endpoint
- `src/server/realtime/WEBHOOK_GUIDE.md` - This documentation
