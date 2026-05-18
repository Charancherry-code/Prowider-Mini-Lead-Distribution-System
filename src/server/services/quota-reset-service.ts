import { prisma } from "@/server/db/prisma";

export type QuotaResetWebhookPayload = {
  externalId: string;
  eventType: "quota_reset";
  timestamp: number;
  source: string; // e.g., "payment_provider", "manual_admin"
  reason?: string;
};

export type QuotaResetResult =
  | {
      success: true;
      processedProviders: number;
      webhookEventId: string;
      isDuplicate: boolean;
    }
  | {
      success: false;
      error: "INVALID_PAYLOAD" | "DATABASE_ERROR";
      message: string;
    };

/**
 * Process quota reset webhook with idempotency
 *
 * Idempotency Strategy:
 * - External webhook provider sends externalId (unique per webhook send)
 * - We store this externalId in database
 * - Duplicate externalIds are rejected (idempotent retry safety)
 *
 * Transaction Flow:
 * 1. Verify externalId hasn't been processed (check for duplicate)
 * 2. If duplicate, return success (idempotent response)
 * 3. If new, atomically within transaction:
 *    a. Reset all provider currentMonthAllocated to 0
 *    b. Update monthResetAt timestamp for each provider
 *    c. Store webhook event record
 * 4. Return success with provider count
 */
export async function processQuotaResetWebhook(
  payload: QuotaResetWebhookPayload,
): Promise<QuotaResetResult> {
  try {
    // ====================================================================
    // STEP 1: Validate payload
    // ====================================================================
    if (!payload.externalId || !payload.eventType) {
      return {
        success: false,
        error: "INVALID_PAYLOAD",
        message: "Missing externalId or eventType",
      };
    }

    // ====================================================================
    // STEP 2: Atomically process webhook with idempotency
    // ====================================================================
    const result = await prisma.$transaction(async (tx) => {
      // Check if this webhook has already been processed
      const existingEvent = await tx.quotaResetWebhook.findUnique({
        where: { externalId: payload.externalId },
        select: { id: true },
      });

      // If already processed, return as success (idempotent response)
      if (existingEvent) {
        return {
          webhookEventId: existingEvent.id,
          processedProviders: 0, // didn't process providers again
          isDuplicate: true,
        };
      }

      // ====================================================================
      // STEP 3: Reset all provider quotas (new webhook)
      // ====================================================================
      const updateResult = await tx.provider.updateMany({
        data: {
          currentMonthAllocated: 0,
          monthResetAt: new Date(),
        },
      });

      const processedProviders = updateResult.count;

      // ====================================================================
      // STEP 4: Store webhook event record
      // ====================================================================
      const webhookEvent = await tx.quotaResetWebhook.create({
        data: {
          externalId: payload.externalId,
          source: payload.source,
          reason: payload.reason,
          payload: {
            type: "quota_reset",
            source: payload.source,
            reason: payload.reason,
            timestamp: payload.timestamp,
            providersReset: processedProviders,
          },
          processedProviders,
          isDuplicate: false,
          status: "SUCCESS",
        },
      });

      return {
        webhookEventId: webhookEvent.id,
        processedProviders,
        isDuplicate: false,
      };
    });

    // Return response
    return {
      success: true,
      processedProviders: result.processedProviders,
      webhookEventId: result.webhookEventId,
      isDuplicate: result.isDuplicate,
    };
  } catch (error) {
    console.error("Quota reset webhook failed:", error);
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
