import { Assignment, PrismaClient, Prisma } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function createAssignment(
  db: DbClient,
  input: { leadId: string; providerId: string },
): Promise<Assignment> {
  return db.assignment.create({
    data: {
      leadId: input.leadId,
      providerId: input.providerId,
    },
  });
}

export async function listAssignments(db: DbClient, limit = 50) {
  return db.assignment.findMany({
    take: limit,
    orderBy: { assignedAt: "desc" },
    include: {
      lead: true,
      provider: true,
    },
  });
}
