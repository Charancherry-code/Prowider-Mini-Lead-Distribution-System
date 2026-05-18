import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { validateCreateLeadRequest } from "@/server/utils/lead-validation";
import { createLead } from "@/server/services/lead-create-service";

function formatValidationErrors(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Request body must be valid JSON" },
        { status: 400 },
      );
    }

    let input;
    try {
      input = validateCreateLeadRequest(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", message: formatValidationErrors(error) },
          { status: 400 },
        );
      }
      throw error;
    }

    const result = await createLead(input);

    if (!result.success) {
      const statusByError: Record<string, number> = {
        SERVICE_NOT_FOUND: 404,
        DUPLICATE_LEAD: 400,
        NO_AVAILABLE_PROVIDERS: 409,
        MANDATORY_PROVIDER_QUOTA_EXCEEDED: 409,
        ALLOCATION_FAILED: 409,
        DATABASE_ERROR: 500,
      };

      const messages: Record<string, string> = {
        DUPLICATE_LEAD: `A lead with this phone already exists for the selected service`,
        NO_AVAILABLE_PROVIDERS:
          "No providers with remaining quota are available for this service",
        MANDATORY_PROVIDER_QUOTA_EXCEEDED:
          "A mandatory provider has no remaining quota for this month",
        ALLOCATION_FAILED: result.message ?? "Lead allocation failed",
        SERVICE_NOT_FOUND: "Service not found",
        DATABASE_ERROR: "Database error while creating lead",
      };

      return NextResponse.json(
        {
          error: result.error,
          message: messages[result.error] ?? "Request failed",
        },
        { status: statusByError[result.error] ?? 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          leadId: result.leadId,
          assignmentIds: result.assignmentIds,
          allocatedProviders: result.allocatedProviders,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/leads/create error:", error);
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
