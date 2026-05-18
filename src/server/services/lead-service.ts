import { prisma } from "@/server/db/prisma";
import { listLeads } from "@/server/db/lead-repository";

export async function getLeads(limit = 50) {
  return listLeads(prisma, limit);
}
