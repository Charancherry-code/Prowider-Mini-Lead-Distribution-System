/\*\*

- CONCURRENCY SAFETY IN PRISMA + POSTGRESQL LEAD ALLOCATION
-
- A detailed guide to avoiding race conditions, duplicate assignments,
- quota over-allocation, and unfair provider selection.
- ============================================================================
  \*/

// ============================================================================
// PART 1: THE PROBLEM
// ============================================================================

/\*\*

- WITHOUT proper concurrency handling, here's what can go wrong:
-
- Scenario: 10 concurrent requests allocate leads to providers
-
- Time | Request 1 | Request 2
- -----|------------------------------|------------------------------
- 1 | READ index=0, quota[P1]=9 | READ index=0, quota[P1]=9
- 2 | SELECT Provider WHERE id=P1 | SELECT Provider WHERE id=P1
- 3 | CREATE Assignment P1->Lead1 | CREATE Assignment P2->Lead2
- 4 | UPDATE index=1, quota[P1]=10 | UPDATE index=1, quota[P1]=10
- 5 | COMMIT | COMMIT
-
- Result: Both requests saw same provider as available, both assigned.
- Provider P1 now at quota 11 (over-allocated by 1).
-
- This happens because reads and writes are not atomic.
  \*/

// ============================================================================
// PART 2: ISOLATION LEVELS
// ============================================================================

/\*\*

- PostgreSQL Isolation Levels (from weakest to strongest):
-
- 1.  READ UNCOMMITTED (not in PostgreSQL, treated as READ COMMITTED)
- - Can read uncommitted changes from other transactions
- - NOT SAFE for allocation
-
- 2.  READ COMMITTED (default in most databases)
- - Can only read committed data
- - BUT: Phantom reads, non-repeatable reads allowed
- - PROBLEM: Two transactions read same row, both think quota available
- - NOT SAFE for allocation
-
- 3.  REPEATABLE READ (PostgreSQL default)
- - Same row always returns same value in one transaction
- - BUT: Phantom reads allowed (new rows can appear)
- - Partially safe, but still has edge cases
-
- 4.  SERIALIZABLE (strictest)
- - Transactions execute as if they were serial (one after another)
- - Detects conflicts and aborts if necessary
- - SAFE for allocation, but can have retry overhead
-
- =========================================================================
- FOR THIS ASSIGNMENT: Use SERIALIZABLE
- =========================================================================
- Reason: Allocation state must be perfectly consistent.
- Cost: Potential transaction conflicts require retry logic.
- Benefit: No race conditions, fair distribution guaranteed.
  \*/

// ============================================================================
// PART 3: ROW LOCKING STRATEGY
// ============================================================================

/\*\*

- PostgreSQL Row Locks (within a transaction):
-
- 1.  FOR SHARE (Row-level read lock)
- - Multiple transactions can hold FOR SHARE on same row
- - Blocks FOR UPDATE but not other FOR SHARE
- - Use: Read-only operations that need to wait for writes
- - NOT used here
-
- 2.  FOR UPDATE (Row-level write lock)
- - Only one transaction can hold FOR UPDATE on same row
- - Blocks other FOR UPDATE and FOR SHARE
- - Waits if another transaction holds lock
- - Use: Protect state updates
- - USED HERE for AllocationState
-
- 3.  FOR UPDATE SKIP LOCKED
- - Like FOR UPDATE but skip rows already locked
- - Use: Skip contended rows, find available resources
- - NOT used here (we want to wait for consistency)
-
- =========================================================================
- FOR THIS ASSIGNMENT: Use FOR UPDATE on AllocationState
- =========================================================================
- Why: Only one allocation can update round-robin index at a time.
- Effect: Second concurrent request waits for first to finish.
- Result: Index increments fairly, no double-assignment.
  \*/

// ============================================================================
// PART 4: TRANSACTION STRATEGY
// ============================================================================

/\*\*

- The complete concurrency-safe transaction flow:
-
- TRANSACTION START (SERIALIZABLE isolation)
-
- Phase 1: Acquire Lock
- ─────────────────────────────────────────
- SELECT AllocationState WHERE serviceId = ? FOR UPDATE
- → Blocks other transactions trying to update this service
- → Waits if another transaction holds lock
- → Read current lastProviderIndex and providerOrder
-
- Phase 2: Check Preconditions
- ─────────────────────────────────────────
- SELECT Lead WHERE id = ? FOR UPDATE
- → Check lead hasn't been allocated yet
- → Check lead belongs to correct service
- → Prevent allocating already-allocated lead
-
- Phase 3: Select Providers
- ─────────────────────────────────────────
- - Identify mandatory providers (always assign)
- - Calculate next round-robin index
- - Query Provider quota status (no lock needed, within transaction)
- - Select first available provider with remaining quota
- - Collect 3 total providers (mandatory + fair-pool)
-
- Phase 4: Create Assignments (Atomic)
- ─────────────────────────────────────────
- CREATE Assignment (leadId, providerId) × 3
- → Database enforces @@unique([leadId, providerId])
- → If somehow same provider twice, DB rejects
- → Prevents duplicate assignments
-
- Phase 5: Update Quota
- ─────────────────────────────────────────
- UPDATE Provider SET currentMonthAllocated = currentMonthAllocated + 1 × 3
- → Increments within same transaction
- → No window for quota to be read by concurrent request
-
- Phase 6: Update Allocation State
- ─────────────────────────────────────────
- UPDATE AllocationState
- SET lastProviderIndex = nextIndex
- → Releases lock when transaction commits
- → Next request reads updated index
-
- TRANSACTION COMMIT
- → All changes atomic: assignments + quotas + index
- → If any step fails, entire transaction rolls back
  \*/

// ============================================================================
// PART 5: WHY THIS IS CONCURRENCY-SAFE
// ============================================================================

/\*\*

- Defense Layer 1: SERIALIZABLE Isolation
- ────────────────────────────────────────
- Even if two transactions try to run in parallel, PostgreSQL ensures
- they execute as if serialized (one after another).
-
- Example:
- T1 and T2 start at same time
- T1 acquires AllocationState lock first
- T2 waits for T1 to finish
- T1 commits with index=1
- T2 sees index=1, advances to index=2
- Result: Fair distribution, no skipped indexes
-
- Defense Layer 2: Row-Level Locking
- ────────────────────────────────────────
- FOR UPDATE on AllocationState ensures only one transaction
- modifies round-robin state at a time.
-
- If T2 tries to lock same row while T1 holds it:
- T2 blocks (waits) until T1 releases
- No spinning, no busy-waiting, no conflicts
- Database handles queuing efficiently
-
- Defense Layer 3: Database Constraints
- ────────────────────────────────────────
- @@unique([leadId, providerId]) on Assignment table
-
- If somehow same provider assigned twice (impossible within
- transaction, but good to have):
- INSERT fails with unique constraint violation
- Transaction rolls back
- Consumer retries and gets fresh allocation
-
- Defense Layer 4: Atomic Updates
- ────────────────────────────────────────
- All mutations (assignments, quotas, index) in one transaction
-
- Either:
- - All succeed and commit together
- - Any fails and entire transaction rolls back
-
- No partial state (e.g., assignment created but quota not updated)
-
- Defense Layer 5: Quota Check Within Transaction
- ────────────────────────────────────────────────
- Provider quota queried in same transaction where assignment created
-
- Between check and insert:
- - No concurrent transaction can change quota
- - SERIALIZABLE prevents phantom reads
- - Quota value is guaranteed accurate
-
- Defense Layer 6: No Stale State
- ────────────────────────────────────────
- AllocationState.lastProviderIndex always read fresh
-
- Each transaction:
- - Reads current index (guaranteed fresh due to lock)
- - Increments it atomically
- - Writes back immediately
-
- Next transaction sees updated value, no lag
  \*/

// ============================================================================
// PART 6: SERIALIZABLE vs READ COMMITTED
// ============================================================================

/\*\*

- READ COMMITTED (Weak Concurrency)
- ──────────────────────────────────
-
- Pros:
- - Higher throughput (less waiting)
- - No transaction conflicts
- - Simple to implement
-
- Cons:
- - Must add explicit locks (SELECT FOR UPDATE)
- - Phantom reads still possible
- - Easy to miss edge cases
- - False sense of security
-
- Example Failure with READ COMMITTED:
- ────────────────────────────────────
- T1: SELECT quota WHERE providerId=1 → returns 9
- T2: SELECT quota WHERE providerId=1 → returns 9 (not yet committed)
- T1: UPDATE quota = 10, COMMIT
- T2: UPDATE quota = 10, COMMIT
- Result: Both incremented to same value (should be 11)
-
- Requires manual locking:
- SELECT quota WHERE providerId=1 FOR UPDATE
- But then you're doing SERIALIZABLE's job manually.
-
- SERIALIZABLE (Strong Concurrency)
- ────────────────────────────────
-
- Pros:
- - Correct by default (no footguns)
- - Database ensures consistency
- - Easier to reason about (acts serial)
- - No forgotten locks
-
- Cons:
- - Potential transaction conflicts (P2034)
- - Must implement retry logic
- - Slightly lower throughput under high contention
-
- Example Flow with SERIALIZABLE:
- ────────────────────────────────
- T1: BEGIN SERIALIZABLE
- T2: BEGIN SERIALIZABLE
- T1: SELECT FOR UPDATE AllocationState
- T2: SELECT FOR UPDATE AllocationState (waits for T1)
- T1: (allocation logic)
- T1: COMMIT
- T2: (wakes up, lock released)
- T2: SELECT FOR UPDATE AllocationState (lock acquired)
- T2: (allocation logic)
- T2: COMMIT
- Result: Perfect fairness, correct state, no race conditions
-
- =========================================================================
- RECOMMENDATION FOR THIS ASSIGNMENT
- =========================================================================
- Use SERIALIZABLE with Prisma $transaction:
-
- const result = await prisma.$transaction(
- async (tx) => { /_ allocation logic _/ },
- { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
- );
-
- Why:
- 1.  Lead allocation needs perfect consistency (not negotiable)
- 2.  SERIALIZABLE guarantees it automatically
- 3.  Retry logic is simple (catch P2034, retry)
- 4.  High contention unlikely (10-100 concurrent requests is fine)
- 5.  Cost of conflict << cost of bug
      \*/

// ============================================================================
// PART 7: PRISMA IMPLEMENTATION EXAMPLE
// ============================================================================

/\*\*

- See: src/server/services/provider-allocation-service.ts
-
- Key patterns:
-
- 1.  Use $transaction with isolationLevel
- ──────────────────────────────────────
- const result = await prisma.$transaction(
- async (tx) => {
-     // allocation code
- },
- { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
- );
-
- 2.  Lock AllocationState with FOR UPDATE
- ───────────────────────────────────────
- await tx.$queryRaw`
- SELECT \* FROM "AllocationState"
- WHERE "serviceId" = ${serviceId}
- FOR UPDATE
- `
-
- 3.  Lock Lead to prevent double-allocation
- ──────────────────────────────────────────
- const lead = await tx.lead.findUnique({
- where: { id: leadId }
- });
-
- 4.  Create assignments with transaction-local write
- ──────────────────────────────────────────────────
- const assignment = await tx.assignment.create({
- data: { leadId, providerId, status: "PENDING" }
- });
-
- 5.  Handle transaction conflicts
- ───────────────────────────────
- catch (error) {
- if (error instanceof Prisma.PrismaClientKnownRequestError) {
-     if (error.code === "P2034") {
-       // Serialization conflict, safe to retry
-       return retryAllocate(leadId, serviceId);
-     }
- }
- }
  \*/

// ============================================================================
// PART 8: TESTING CONCURRENCY
// ============================================================================

/\*\*

- How to verify concurrency safety:
-
- Test 1: Quota Enforcement
- ─────────────────────────
- 1.  Create 30 leads
- 2.  Start 30 concurrent allocation requests for same service
- 3.  Expected: Each provider allocated ≤ 10 times
- 4.  Verify: Sum of all allocations = 30, no provider > 10
- 5.  If any provider > 10: quota enforcement failed
-
- Test 2: Fair Distribution
- ──────────────────────────
- 1.  Allocate 100 leads sequentially to service with 8 providers
- 2.  Verify: Each provider gets ≈12-13 allocations
- 3.  Verify: Round-robin index incremented fairly
- 4.  If distribution skewed: fairness broken
-
- Test 3: Concurrent Fairness
- ────────────────────────────
- 1.  Create 100 leads
- 2.  Allocate all 100 concurrently to same service
- 3.  Verify: No provider allocated more than 13 times
- 4.  Verify: All allocations succeed (or retry on conflict)
- 5.  Verify: Final state is deterministic (run twice, same result)
-
- Test 4: No Duplicate Assignments
- ─────────────────────────────────
- 1.  Allocate 100 leads concurrently
- 2.  Query: Count assignments per lead
- 3.  Verify: Each lead has exactly 3 assignments
- 4.  Query: Count (leadId, providerId) pairs
- 5.  Verify: No duplicates (all pairs unique)
-
- Test 5: Server Restart Fairness
- ────────────────────────────────
- 1.  Allocate 10 leads, stop server
- 2.  Restart server
- 3.  Allocate 10 more leads
- 4.  Verify: Round-robin continues fairly (no reset to index 0)
- 5.  Verify: Fair distribution across restart boundary
      \*/

// ============================================================================
// PART 9: EDGE CASES HANDLED
// ============================================================================

/\*\*

- 1.  All providers quota exhausted
- ────────────────────────────
- Code: return { success: false, error: "NO_AVAILABLE_PROVIDERS" }
- Response: 409 Conflict
- Consumer: Retry after quota reset or next month
-
- 2.  Mandatory provider at quota
- ──────────────────────────
- Decision: Still assign (mandatory = priority)
- May temporarily exceed quota
- Alternative: Reject lead (set STRICT_QUOTA = true)
-
- 3.  Lead already has 3 assignments
- ────────────────────────────
- Check: WHERE lead.assignmentCount >= 3
- Return: { success: false, error: "LEAD_ALREADY_ALLOCATED" }
- Response: 400 Bad Request
-
- 4.  Concurrent allocation attempts same lead
- ────────────────────────────────────────
- Lock: Lead row with SELECT FOR UPDATE
- Result: Second request waits, sees updated state
- Outcome: First allocation succeeds, second gets 400
-
- 5.  Transaction deadlock (P2034)
- ──────────────────────────
- Cause: Circular lock dependencies (rare)
- Handle: Catch error, implement exponential backoff retry
- Limit: Max 3 retries, then return 500 error
-
- 6.  Network partition / connection lost
- ─────────────────────────────────
- Behavior: Transaction rolls back
- Result: Lead not allocated, safe to retry
- Idempotency: Check lead.assignmentCount before returning error
  \*/

// ============================================================================
// SUMMARY
// ============================================================================

/\*\*

- Concurrency Safety Checklist:
-
- ✓ Use SERIALIZABLE isolation level
- ✓ Lock AllocationState with FOR UPDATE
- ✓ Lock Lead to prevent double-allocation
- ✓ Check preconditions (lead exists, not already allocated)
- ✓ Select providers within transaction (fresh data)
- ✓ Create assignments atomically
- ✓ Update quotas in same transaction
- ✓ Update round-robin index atomically
- ✓ Implement retry logic for P2034 conflicts
- ✓ Use unique constraints as safety net
- ✓ Test with concurrent load
-
- Result: Race-condition-free, fair, quota-safe allocation.
  \*/
