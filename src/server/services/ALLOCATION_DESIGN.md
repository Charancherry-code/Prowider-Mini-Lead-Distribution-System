// CONCURRENCY-SAFE PROVIDER ALLOCATION DESIGN SUMMARY
// ============================================================================

/\*\*

- 1.  ALGORITHM EXPLANATION (1 line)
- → Mandatory providers + round-robin fair pool with atomic state update in Prisma transaction.
  \*/

/\*\*

- 2.  TRANSACTION FLOW (1 line)
- → Lock AllocationState row → Read index → Select providers → Check quotas → Create assignments → Update index → Commit.
  \*/

/\*\*

- 3.  EDGE CASES (1 line)
- → All providers quota-exhausted (NO_AVAILABLE_PROVIDERS), mandatory provider over quota (still assign), concurrent races (serializable isolation prevents), month-boundary resets (cron updates), lead already allocated (check count first).
  \*/

/\*\*

- 4.  TYPESCRIPT IMPLEMENTATION (1 line)
- → See src/server/services/provider-allocation-service.ts with typed Result unions, Prisma $transaction with SERIALIZABLE isolation, raw SQL FOR UPDATE lock.
  \*/

/\*\*

- 5.  DATABASE LOCKING STRATEGY (1 line)
- → SELECT FOR UPDATE on AllocationState row ensures serialization; quota checks within transaction; no SKIP LOCKED because we want to wait for consistency.
  \*/

/\*\*

- 6.  WHY CONCURRENCY-SAFE (1 line)
- → Prisma SERIALIZABLE isolation + atomic AllocationState update + row-level lock + unique constraint enforcement = no race conditions, fair distribution, no duplicate assignments.
  \*/

// ============================================================================
// KEY DESIGN DECISIONS
// ============================================================================

/\*\*

- Config-based allocation rules:
- Service 1: Mandatory [Provider 1] + Fair Pool [2, 3, 4]
- Service 2: Mandatory [Provider 5] + Fair Pool [6, 7, 8]
- Service 3: Mandatory [1, 4] + Fair Pool [2, 3, 5, 6, 7, 8]
-
- Each lead gets exactly 3 providers = mandatory(s) + round-robin from fair pool.
  \*/

/\*\*

- Quota enforcement:
- Monthly quota = 10 assignments per provider.
- Checked within transaction to prevent stale quota reads.
- Fair pool provider selected only if currentMonthAllocated < monthlyQuota.
- Mandatory providers still assigned even if quota exceeded (business rule).
  \*/

/\*\*

- Round-robin state persistence:
- AllocationState.lastProviderIndex stored in database.
- Ensures fairness across server restarts and multiple concurrent requests.
- Updated atomically with assignments in same transaction.
  \*/

/\*\*

- Concurrency handling:
- Prisma $transaction with isolationLevel: Prisma.TransactionIsolationLevel.Serializable.
- Two concurrent requests are serialized by database lock on AllocationState.
- First request locks → allocates → increments index → unlocks.
- Second request waits for lock → sees updated index → allocates to next provider.
  \*/

// ============================================================================
// API ENDPOINTS
// ============================================================================

/\*\*

- POST /api/leads/create
- Create a new lead (safe from duplicates).
-
- POST /api/leads/:leadId/allocate?serviceId=:serviceId
- Allocate lead to 3 providers using concurrency-safe round-robin.
  \*/

// ============================================================================
// TESTING CONCURRENCY
// ============================================================================

/\*\*

- Expected behavior under load:
-
- 1.  Create 100 concurrent allocation requests for same service
- → Each gets different provider from fair pool
- → Round-robin index increments atomically
- → No provider assigned twice to same lead
- → Final state correct (index % fairPoolSize)
-
- 2.  Create 100 leads, allocate sequentially
- → Each lead assigned to 3 unique providers
- → Quotas increment correctly
- → Fair distribution across rounds
-
- 3.  Create 100 leads, allocate concurrently
- → Some requests may deadlock and retry (P2034)
- → Eventually all succeed
- → Final quota state consistent
- → No duplicate assignments
  \*/
