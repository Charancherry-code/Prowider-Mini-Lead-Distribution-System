import { Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "@/server/db/prisma";
import { emitDashboardUpdated } from "@/server/realtime/socket";
import {
  ALLOCATION_RULES,
  ASSIGNMENTS_PER_LEAD,
  providerNameForNumber,
} from "@/server/services/allocation-rules";

export type AllocationResult =
  | {
      success: true;
      assignmentIds: string[];
      allocatedProviders: string[];
    }
  | {
      success: false;
      error:
        | "NO_AVAILABLE_PROVIDERS"
        | "INVALID_SERVICE"
        | "LEAD_NOT_FOUND"
        | "LEAD_ALREADY_ALLOCATED"
        | "MANDATORY_PROVIDER_QUOTA_EXCEEDED"
        | "DATABASE_ERROR";
    };

type ProviderRow = {
  id: string;
  monthlyQuota: number;
  currentMonthAllocated: number;
};

async function findProviderByNumber(
  tx: Prisma.TransactionClient,
  number: number,
): Promise<ProviderRow | null> {
  return tx.provider.findFirst({
    where: { name: providerNameForNumber(number) },
    select: {
      id: true,
      monthlyQuota: true,
      currentMonthAllocated: true,
    },
  });
}

function hasQuota(provider: ProviderRow): boolean {
  return provider.currentMonthAllocated < provider.monthlyQuota;
}

/**
 * Round-robin picks from fair pool; skips selected ids and exhausted quota.
 */
function pickFromFairPool(
  fairPoolIds: string[],
  startIndex: number,
  count: number,
  selectedIds: Set<string>,
  quotaById: Map<string, ProviderRow>,
): { picked: string[]; lastIndex: number } {
  const picked: string[] = [];
  if (fairPoolIds.length === 0 || count === 0) {
    return { picked, lastIndex: startIndex };
  }

  let index = startIndex;
  let attempts = 0;
  const maxAttempts = fairPoolIds.length * count * 2;

  while (picked.length < count && attempts < maxAttempts) {
    index = (index + 1) % fairPoolIds.length;
    const candidateId = fairPoolIds[index];
    attempts++;

    if (selectedIds.has(candidateId)) continue;

    const provider = quotaById.get(candidateId);
    if (!provider || !hasQuota(provider)) continue;

    picked.push(candidateId);
    selectedIds.add(candidateId);
  }

  return { picked, lastIndex: index };
}

export async function allocateLeadToProviders(
  leadId: string,
  serviceId: string,
): Promise<AllocationResult> {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const lead = await tx.lead.findUnique({
          where: { id: leadId },
          select: {
            id: true,
            assignmentCount: true,
            serviceId: true,
            service: { select: { id: true, name: true } },
          },
        });

        if (!lead) {
          return { success: false as const, error: "LEAD_NOT_FOUND" as const };
        }

        if (lead.serviceId !== serviceId) {
          return { success: false as const, error: "INVALID_SERVICE" as const };
        }

        if (lead.assignmentCount >= ASSIGNMENTS_PER_LEAD) {
          return {
            success: false as const,
            error: "LEAD_ALREADY_ALLOCATED" as const,
          };
        }

        const rules = ALLOCATION_RULES[lead.service.name];
        if (!rules) {
          return { success: false as const, error: "INVALID_SERVICE" as const };
        }

        const lockResult = await tx.$queryRaw<
          Array<{ lastProviderIndex: number; providerAllocationOrder: string }>
        >`
          SELECT "lastProviderIndex", "providerAllocationOrder"
          FROM "AllocationState"
          WHERE "serviceId" = ${serviceId}
          FOR UPDATE
        `;

        if (lockResult.length === 0) {
          return { success: false as const, error: "INVALID_SERVICE" as const };
        }

        const state = lockResult[0];
        const fairPoolIds = JSON.parse(
          state.providerAllocationOrder,
        ) as string[];

        const selectedIds = new Set<string>();
        const selectedProviderIds: string[] = [];
        const quotaById = new Map<string, ProviderRow>();

        for (const num of rules.mandatory) {
          const provider = await findProviderByNumber(tx, num);
          if (!provider) {
            return {
              success: false as const,
              error: "INVALID_SERVICE" as const,
            };
          }
          quotaById.set(provider.id, provider);

          if (!hasQuota(provider)) {
            return {
              success: false as const,
              error: "MANDATORY_PROVIDER_QUOTA_EXCEEDED" as const,
            };
          }

          selectedProviderIds.push(provider.id);
          selectedIds.add(provider.id);
        }

        for (const num of rules.fairPool) {
          const provider = await findProviderByNumber(tx, num);
          if (provider) {
            quotaById.set(provider.id, provider);
          }
        }

        const { picked, lastIndex } = pickFromFairPool(
          fairPoolIds,
          state.lastProviderIndex,
          rules.fairSlots,
          selectedIds,
          quotaById,
        );

        selectedProviderIds.push(...picked);

        if (selectedProviderIds.length !== ASSIGNMENTS_PER_LEAD) {
          return {
            success: false as const,
            error: "NO_AVAILABLE_PROVIDERS" as const,
          };
        }

        const assignments = await Promise.all(
          selectedProviderIds.map((providerId) =>
            tx.assignment.create({
              data: {
                leadId,
                providerId,
                status: "PENDING",
                expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
              },
              select: { id: true },
            }),
          ),
        );

        await Promise.all(
          selectedProviderIds.map((providerId) =>
            tx.provider.update({
              where: { id: providerId },
              data: {
                currentMonthAllocated: { increment: 1 },
                lastAllocationAt: new Date(),
                totalAllocationsAllTime: { increment: 1 },
              },
            }),
          ),
        );

        await tx.lead.update({
          where: { id: leadId },
          data: {
            assignmentCount: ASSIGNMENTS_PER_LEAD,
            status: "ASSIGNED",
          },
        });

        await tx.allocationState.update({
          where: { serviceId },
          data: {
            lastProviderIndex: lastIndex,
            allocationOrderUpdatedAt: new Date(),
          },
        });

        return {
          success: true as const,
          assignmentIds: assignments.map((a) => a.id),
          allocatedProviders: selectedProviderIds,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );

    if (result.success) {
      emitDashboardUpdated({
        timestamp: Date.now(),
        allocatedProviders: result.allocatedProviders,
        leadId,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2034") {
      return { success: false, error: "DATABASE_ERROR" };
    }
    console.error("Allocation failed:", error);
    return { success: false, error: "DATABASE_ERROR" };
  }
}

export async function getAllocationState(serviceId: string) {
  const state = await prisma.allocationState.findUnique({
    where: { serviceId },
    select: {
      lastProviderIndex: true,
      providerAllocationOrder: true,
      allocationOrderUpdatedAt: true,
    },
  });

  if (!state) return null;

  return {
    lastProviderIndex: state.lastProviderIndex,
    providerOrder: JSON.parse(state.providerAllocationOrder) as string[],
    updatedAt: state.allocationOrderUpdatedAt,
  };
}
