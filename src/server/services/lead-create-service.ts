import { prisma } from "@/server/db/prisma";
import { CreateLeadInput } from "@/server/utils/lead-validation";
import { allocateLeadToProviders } from "@/server/services/provider-allocation-service";

export type CreateLeadResponse =
  | {
      success: true;
      leadId: string;
      assignmentIds: string[];
      allocatedProviders: string[];
    }
  | {
      success: false;
      error:
        | "DUPLICATE_LEAD"
        | "SERVICE_NOT_FOUND"
        | "ALLOCATION_FAILED"
        | "NO_AVAILABLE_PROVIDERS"
        | "MANDATORY_PROVIDER_QUOTA_EXCEEDED"
        | "DATABASE_ERROR";
      message?: string;
    };

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

/**
 * Create a lead and assign it to exactly 3 providers in one flow.
 */
export async function createLead(
  input: CreateLeadInput,
): Promise<CreateLeadResponse> {
  try {
    const service = await prisma.service.findUnique({
      where: { id: input.serviceId },
      select: { id: true },
    });

    if (!service) {
      return { success: false, error: "SERVICE_NOT_FOUND" };
    }

    const phone = normalizePhone(input.phone);

    const lead = await prisma.lead.create({
      data: {
        serviceId: input.serviceId,
        customerName: input.name,
        customerPhone: phone,
        source: "WEB_FORM",
        metadata: {
          city: input.city,
          description: input.description ?? null,
        },
        status: "NEW",
        isActive: true,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const allocation = await allocateLeadToProviders(lead.id, input.serviceId);

    if (!allocation.success) {
      await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);

      if (allocation.error === "NO_AVAILABLE_PROVIDERS") {
        return { success: false, error: "NO_AVAILABLE_PROVIDERS" };
      }
      if (allocation.error === "MANDATORY_PROVIDER_QUOTA_EXCEEDED") {
        return { success: false, error: "MANDATORY_PROVIDER_QUOTA_EXCEEDED" };
      }
      return {
        success: false,
        error: "ALLOCATION_FAILED",
        message: allocation.error,
      };
    }

    return {
      success: true,
      leadId: lead.id,
      assignmentIds: allocation.assignmentIds,
      allocatedProviders: allocation.allocatedProviders,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "DUPLICATE_LEAD" };
    }
    console.error("Failed to create lead:", error);
    return { success: false, error: "DATABASE_ERROR" };
  }
}
