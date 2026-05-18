/**
 * Business rules keyed by seeded service name.
 * Provider numbers map to seed names: "Provider 1" … "Provider 8".
 */
export const ALLOCATION_RULES: Record<
  string,
  { mandatory: number[]; fairPool: number[]; fairSlots: number }
> = {
  "Service 1": { mandatory: [1], fairPool: [2, 3, 4], fairSlots: 2 },
  "Service 2": { mandatory: [5], fairPool: [6, 7, 8], fairSlots: 2 },
  "Service 3": { mandatory: [1, 4], fairPool: [2, 3, 5, 6, 7, 8], fairSlots: 1 },
};

export const ASSIGNMENTS_PER_LEAD = 3;

export function providerNameForNumber(n: number): string {
  return `Provider ${n}`;
}
