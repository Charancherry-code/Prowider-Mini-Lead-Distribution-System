import { NextResponse } from "next/server";
import { getProviders } from "@/server/services/provider-service";
import { paginationSchema } from "@/server/utils/validation";
import { toErrorPayload } from "@/server/utils/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = paginationSchema.parse({
      limit: searchParams.get("limit") ?? undefined,
    });
    const providers = await getProviders(limit);

    return NextResponse.json({ success: true, data: providers });
  } catch (error) {
    const payload = toErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.statusCode });
  }
}
