import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  processQuotaResetWebhook,
  type QuotaResetWebhookPayload,
} from "@/server/services/quota-reset-service";

/**
 * Webhook payload validation schema
 */
const quotaResetWebhookSchema = z.object({
  externalId: z.string().min(1, "externalId is required"),
  eventType: z.literal("quota_reset"),
  timestamp: z.number().int().positive("timestamp must be positive"),
  source: z.string().min(1, "source is required"),
  reason: z.string().optional(),
});

/**
 * POST /api/webhooks/quota-reset
 *
 * Webhook endpoint for resetting provider quotas
 *
 * Idempotency: Use the same externalId for retries - endpoint will return
 * 200 OK for both first attempt and retries with identical externalId
 *
 * Request Body:
 * {
 *   "externalId": "evt_1234567890",  // Unique ID from payment provider
 *   "eventType": "quota_reset",
 *   "timestamp": 1716000000,          // Unix timestamp
 *   "source": "payment_provider",     // Where the webhook came from
 *   "reason": "Monthly billing cycle" // Optional
 * }
 *
 * Responses:
 * - 200 OK: Webhook processed successfully (or duplicate, idempotent)
 * - 400 Bad Request: Invalid payload
 * - 500 Internal Server Error: Database error
 */
export async function POST(request: NextRequest) {
  try {
    // ====================================================================
    // Parse and validate request body
    // ====================================================================
    const body = await request.json();

    const validationResult = quotaResetWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const payload = validationResult.data as QuotaResetWebhookPayload;

    // ====================================================================
    // Process webhook
    // ====================================================================
    const result = await processQuotaResetWebhook(payload);

    // ====================================================================
    // Return response
    // ====================================================================
    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          webhookEventId: result.webhookEventId,
          processedProviders: result.processedProviders,
          isDuplicate: result.isDuplicate,
          message: result.isDuplicate
            ? "Webhook already processed (idempotent)"
            : `Successfully reset quotas for ${result.processedProviders} providers`,
        },
        { status: 200 },
      );
    }

    if (result.error === "INVALID_PAYLOAD") {
      return NextResponse.json(
        {
          error: "INVALID_PAYLOAD",
          message: result.message,
        },
        { status: 400 },
      );
    } else {
      // 500: Database or other errors
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
