import { NextResponse } from "next/server";
import { z } from "zod";

const generateLeadsSchema = z.object({
  count: z.number().int().min(1).max(100).default(10),
  serviceId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { count, serviceId } = generateLeadsSchema.parse(body);

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const startTime = Date.now();

    const leadRequests = Array.from({ length: count }, (_, i) => {
      const phone = String(9000000000 + i);
      return fetch(`${baseUrl}/api/leads/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Test Lead ${i + 1}`,
          phone,
          city: `City ${i + 1}`,
          serviceId,
          description: `Concurrent test lead ${i + 1}`,
        }),
      });
    });

    const responses = await Promise.all(leadRequests);
    const totalTime = Date.now() - startTime;

    const results = await Promise.all(
      responses.map(async (response, index) => {
        const data = await response.json();
        return {
          index: index + 1,
          status: response.status,
          success: response.ok,
          data,
        };
      }),
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const allocated = results.filter(
      (r) => r.success && r.data?.data?.allocatedProviders?.length === 3,
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
