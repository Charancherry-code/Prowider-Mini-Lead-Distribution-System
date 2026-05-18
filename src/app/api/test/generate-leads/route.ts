import { NextResponse } from "next/server";
import { z } from "zod";
import { createLead } from "@/server/services/lead-create-service";
import { validateCreateLeadRequest } from "@/server/utils/lead-validation";

const generateLeadsSchema = z.object({
  count: z.number().int().min(1).max(100).default(10),
  serviceId: z.string().min(1),
});

/**
 * Generate leads in-process (no HTTP loopback) for reliable concurrency tests.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { count, serviceId } = generateLeadsSchema.parse(body);

    const runId = Date.now();
    const startTime = Date.now();

    const tasks = Array.from({ length: count }, (_, i) => {
      const input = validateCreateLeadRequest({
        name: `Test Lead ${i + 1}`,
        phone: String(runId).slice(-6) + String(i).padStart(4, "0"),
        city: `City ${i + 1}`,
        serviceId,
        description: `Concurrent test ${i + 1}`,
      });
      return createLead(input);
    });

    const outcomes = await Promise.all(tasks);
    const totalTime = Date.now() - startTime;

    const results = outcomes.map((outcome, index) => {
      if (outcome.success) {
        return {
          index: index + 1,
          status: 201,
          success: true,
          data: {
            leadId: outcome.leadId,
            allocatedProviders: outcome.allocatedProviders,
          },
        };
      }
      return {
        index: index + 1,
        status: outcome.error === "DUPLICATE_LEAD" ? 400 : 409,
        success: false,
        data: { error: outcome.error },
      };
    });

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const allocated = results.filter(
      (r) => r.success && r.data?.allocatedProviders?.length === 3,
    ).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalRequests: count,
        successful,
        failed,
        allocatedToThreeProviders: allocated,
        totalTimeMs: totalTime,
        averageTimeMs: Math.round(totalTime / count),
      },
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 },
    );
  }
}
