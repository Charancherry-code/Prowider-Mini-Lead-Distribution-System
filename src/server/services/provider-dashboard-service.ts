import { prisma } from "@/server/db/prisma";

export type AssignedLeadRow = {
  assignmentId: string;
  leadId: string;
  customerName: string;
  customerPhone: string;
  city: string | null;
  serviceName: string;
  assignedAt: string;
};

export type ProviderDashboardRow = {
  id: string;
  name: string;
  email: string;
  monthlyQuota: number;
  currentMonthAllocated: number;
  remainingQuota: number;
  totalAllocationsAllTime: number;
  assignmentCount: number;
  assignedLeads: AssignedLeadRow[];
};

export async function getProvidersDashboardData(): Promise<
  ProviderDashboardRow[]
> {
  const providers = await prisma.provider.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      monthlyQuota: true,
      currentMonthAllocated: true,
      totalAllocationsAllTime: true,
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 20,
        select: {
          id: true,
          assignedAt: true,
          lead: {
            select: {
              id: true,
              customerName: true,
              customerPhone: true,
              metadata: true,
              service: { select: { name: true } },
            },
          },
        },
      },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    monthlyQuota: p.monthlyQuota,
    currentMonthAllocated: p.currentMonthAllocated,
    remainingQuota: Math.max(0, p.monthlyQuota - p.currentMonthAllocated),
    totalAllocationsAllTime: p.totalAllocationsAllTime,
    assignmentCount: p._count.assignments,
    assignedLeads: p.assignments.map((a) => {
      const meta = a.lead.metadata as { city?: string } | null;
      return {
        assignmentId: a.id,
        leadId: a.lead.id,
        customerName: a.lead.customerName,
        customerPhone: a.lead.customerPhone,
        city: meta?.city ?? null,
        serviceName: a.lead.service.name,
        assignedAt: a.assignedAt.toISOString(),
      };
    }),
  }));
}
