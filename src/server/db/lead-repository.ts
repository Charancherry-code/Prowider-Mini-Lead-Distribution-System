import { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listLeads(db: DbClient, limit = 50) {
  return db.lead.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      service: { select: { name: true } },
      assignments: {
        include: { provider: { select: { id: true, name: true } } },
      },
    },
  });
}
