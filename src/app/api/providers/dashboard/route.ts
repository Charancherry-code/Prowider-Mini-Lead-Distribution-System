import { NextResponse } from "next/server";
import { getProvidersDashboardData } from "@/server/services/provider-dashboard-service";

export async function GET() {
  const providers = await getProvidersDashboardData();

  return NextResponse.json({
    success: true,
    data: providers,
  });
}
