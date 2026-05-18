import { prisma } from "@/server/db/prisma";

export async function getProviders(limit = 50) {
  return prisma.provider.findMany({
    take: limit,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      monthlyQuota: true,
      currentMonthAllocated: true,
      status: true,
    },
  });
}
