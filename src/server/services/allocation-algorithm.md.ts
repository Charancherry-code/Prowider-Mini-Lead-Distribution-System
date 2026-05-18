/**
 * ALLOCATION ALGORITHM OVERVIEW
 *
 * 1-line summary:
 * Mandatory providers + round-robin fair pool with atomic state update in transaction.
 *
 * ===========================================================================
 * ALGORITHM EXPLANATION
 * ===========================================================================
 *
 * Per lead allocation:
 * 1. Identify mandatory providers for the service (always assigned)
 * 2. Identify fair pool providers (candidates for 3rd slot via round-robin)
 * 3. Use AllocationState.lastProviderIndex to round-robin fairly
 * 4. Select next available provider from fair pool (skip if quota exceeded)
 * 5. Atomically create 3 assignments + update AllocationState in one transaction
 *
 * Why round-robin works:
 * - Persisting lastProviderIndex ensures fairness across server restarts
 * - Even if requests arrive in parallel, transaction serialization ensures
 *   each gets a unique turn
 * - If provider quota hit, skip and try next in rotation
 *
 * ===========================================================================
 * TRANSACTION FLOW
 * ===========================================================================
 *
 * 1. SELECT AllocationState FOR UPDATE (lock the row, wait if needed)
 * 2. Read lastProviderIndex and providerAllocationOrder
 * 3. Calculate next index: (lastProviderIndex + 1) % providers.length
 * 4. Query Provider quotas using raw SQL (subquery within transaction)
 * 5. Find first available provider from fair pool that has quota
 * 6. Create 3 Assignment records (mandatory + fair)
 * 7. UPDATE AllocationState.lastProviderIndex = next index
 * 8. COMMIT transaction
 *
 * If step 4-5 find no available provider → ROLLBACK, return error
 *
 * ===========================================================================
 * EDGE CASES
 * ===========================================================================
 *
 * 1. All providers in fair pool at monthly quota
 *    → Allocation fails with "NO_AVAILABLE_PROVIDERS"
 *    → Consumer retries after quota reset
 *
 * 2. Mandatory provider at quota
 *    → Still assigned (mandatory takes precedence)
 *    → May exceed quota temporarily until reset
 *    → OR reject lead if strict quota enforcement required
 *
 * 3. Two concurrent requests race for same provider
 *    → First transaction locks AllocationState
 *    → Second waits for lock release
 *    → Second sees updated index, gets different provider
 *    → No double-assignment because AllocationState update is atomic
 *
 * 4. Provider quota resets at month boundary
 *    → Cron job updates Provider.currentMonthAllocated = 0
 *    → Must run before allocation queries check quota
 *
 * 5. Lead already has 3 assignments
 *    → Check assignment count before allocation
 *    → Return early if count == 3
 *
 * ===========================================================================
 * DATABASE LOCKING STRATEGY
 * ===========================================================================
 *
 * Row-level locking (PostgreSQL):
 * - Lock on AllocationState row: SELECT FOR UPDATE
 * - Ensures only one transaction updates that service's round-robin state
 * - Serializable isolation level (Prisma default in transactions)
 *
 * Provider quota check:
 * - Subquery within transaction (no locking needed, consistent snapshot)
 * - By the time assignments are created, quota is guaranteed accurate
 *
 * Why SKIP LOCKED not needed:
 * - We want to wait for the AllocationState lock, not skip it
 * - Skipping would mean potentially overwriting another request's state
 *
 * ===========================================================================
 * WHY THIS IS CONCURRENCY SAFE
 * ===========================================================================
 *
 * 1. Serializable isolation:
 *    - Prisma $transaction runs at isolation level SERIALIZABLE
 *    - Two concurrent transactions cannot interleave
 *    - One commits first, second sees updated AllocationState
 *
 * 2. Atomic state update:
 *    - AllocationState update (lastProviderIndex) happens in same transaction
 *    - No race condition between reading index and writing new index
 *
 * 3. Database enforces unique constraints:
 *    - @@unique([leadId, providerId]) prevents duplicate assignments
 *    - If somehow same provider assigned twice, DB rejects
 *
 * 4. Quota checks within transaction:
 *    - Query quota value in same transaction
 *    - Assignment created immediately after
 *    - No window where quota changes between check and assignment
 *
 * 5. No stale state:
 *    - Each request reads fresh AllocationState before lock released
 *    - lastProviderIndex always increments monotonically
 *    - Fair distribution guaranteed even under high concurrency
 *
 * ===========================================================================
 */

export const ALLOCATION_STRATEGY = {
  description:
    "Mandatory providers + round-robin fair pool with atomic state update in transaction",
} as const;
