import { prisma } from "@/server/db/prisma";
import { listAssignments } from "@/server/db/assignment-repository";

export async function getAssignments(limit = 50) {
  return listAssignments(prisma, limit);
}
