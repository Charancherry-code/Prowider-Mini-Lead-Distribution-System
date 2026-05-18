import { PrismaClient } from "@prisma/client";
import { ALLOCATION_RULES, providerNameForNumber } from "../src/server/services/allocation-rules";

const prisma = new PrismaClient();

const SERVICES = [
  {
    name: "Service 1",
    description: "Primary service",
    leadExpiryHours: 72,
    assignmentsPerLead: 3,
  },
  {
    name: "Service 2",
    description: "Secondary service",
    leadExpiryHours: 72,
    assignmentsPerLead: 3,
  },
  {
    name: "Service 3",
    description: "Tertiary service",
    leadExpiryHours: 72,
    assignmentsPerLead: 3,
  },
];

const PROVIDERS = Array.from({ length: 8 }, (_, i) => ({
  name: providerNameForNumber(i + 1),
  email: `provider${i + 1}@example.com`,
  phone: `+1-555-${String(1000 + i).padStart(4, "0")}`,
  monthlyQuota: 10,
  currentMonthAllocated: 0,
  totalAllocationsAllTime: 0,
}));

async function main() {
  console.log("Starting seed...");

  const services = await Promise.all(
    SERVICES.map((service) =>
      prisma.service.upsert({
        where: { name: service.name },
        update: {
          description: service.description,
          leadExpiryHours: service.leadExpiryHours,
          assignmentsPerLead: service.assignmentsPerLead,
        },
        create: service,
      }),
    ),
  );

  const providers = await Promise.all(
    PROVIDERS.map((provider) =>
      prisma.provider.upsert({
        where: { email: provider.email },
        update: {
          name: provider.name,
          phone: provider.phone,
          monthlyQuota: provider.monthlyQuota,
        },
        create: provider,
      }),
    ),
  );

  const providerByNumber = new Map<number, string>();
  for (const p of providers) {
    const match = /^Provider (\d+)$/.exec(p.name);
    if (match) {
      providerByNumber.set(Number(match[1]), p.id);
    }
  }

  for (const service of services) {
    const rules = ALLOCATION_RULES[service.name];
    if (!rules) continue;

    const fairPoolIds = rules.fairPool
      .map((n) => providerByNumber.get(n))
      .filter((id): id is string => Boolean(id));

    await prisma.allocationState.upsert({
      where: { serviceId: service.id },
      update: {
        providerAllocationOrder: JSON.stringify(fairPoolIds),
        lastProviderIndex: 0,
        allocationOrderUpdatedAt: new Date(),
      },
      create: {
        serviceId: service.id,
        lastProviderIndex: 0,
        providerAllocationOrder: JSON.stringify(fairPoolIds),
      },
    });
  }

  console.log(`Seeded ${services.length} services, ${providers.length} providers`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
