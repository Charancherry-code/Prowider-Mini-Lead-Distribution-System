import { NextResponse } from "next/server";
import { getLeads } from "@/server/services/lead-service";
import { paginationSchema } from "@/server/utils/validation";
import { toErrorPayload } from "@/server/utils/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = paginationSchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    const leads = await getLeads(limit);

    return NextResponse.json({ success: true, data: leads });
  } catch (error) {
    const payload = toErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.statusCode });
  }
}
