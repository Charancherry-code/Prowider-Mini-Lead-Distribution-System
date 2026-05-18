import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { allocateLeadToProviders } from "@/server/services/provider-allocation-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ leadId: string }> },
): Promise<NextResponse> {
  try {
    const { leadId } = await params;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { serviceId: true },
    });

    if (!lead) {
      return NextResponse.json(
        { error: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
    }

    const result = await allocateLeadToProviders(leadId, lead.serviceId);

    if (!result.success) {
      const statusMap: Record<string, number> = {
        LEAD_NOT_FOUND: 404,
        INVALID_SERVICE: 404,
        LEAD_ALREADY_ALLOCATED: 400,
        NO_AVAILABLE_PROVIDERS: 409,
        MANDATORY_PROVIDER_QUOTA_EXCEEDED: 409,
        DATABASE_ERROR: 500,
      };

      return NextResponse.json(
        { error: result.error, message: result.error },
        { status: statusMap[result.error] ?? 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        leadId,
        assignmentIds: result.assignmentIds,
        allocatedProviders: result.allocatedProviders,
      },
    });
  } catch (error) {
    console.error("POST /api/leads/:leadId/allocate error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
