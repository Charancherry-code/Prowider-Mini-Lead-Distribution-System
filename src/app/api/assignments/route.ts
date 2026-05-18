import { NextResponse } from "next/server";

import { getAssignments } from "@/server/services/assignment-list-service";
import { paginationSchema } from "@/server/utils/validation";
import { toErrorPayload } from "@/server/utils/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = paginationSchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    const assignments = await getAssignments(limit);

    return NextResponse.json({ data: assignments });
  } catch (error) {
    const payload = toErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.statusCode });
  }
}
