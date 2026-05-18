import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  const services = await prisma.service.findMany({
    select: {
      id: true,
      name: true,
      assignmentsPerLead: true,
      leadExpiryHours: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    success: true,
    data: services,
  });
}
