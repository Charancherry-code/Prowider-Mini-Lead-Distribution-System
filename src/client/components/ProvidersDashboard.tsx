"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useProviderUpdates,
  type ProviderUpdate,
} from "@/client/hooks/useProviderUpdates";

type AssignedLeadRow = {
  assignmentId: string;
  leadId: string;
  customerName: string;
  customerPhone: string;
  city: string | null;
  serviceName: string;
  assignedAt: string;
};

type ProviderDashboardRow = {
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

function ProviderCard({ provider }: { provider: ProviderDashboardRow }) {
  const percentUsed = Math.round(
    (provider.currentMonthAllocated / provider.monthlyQuota) * 100,
  );
  const quotaStatusColor =
    provider.remainingQuota <= 0
      ? "text-red-600"
      : provider.remainingQuota <= 2
        ? "text-amber-600"
        : "text-green-600";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{provider.name}</h3>
        <p className="text-sm text-slate-500">{provider.email}</p>
      </div>

      <div className="mb-4 mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Remaining quota</span>
          <span className={`text-sm font-semibold ${quotaStatusColor}`}>
            {provider.remainingQuota} / {provider.monthlyQuota}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full transition-all ${
              provider.remainingQuota <= 0
                ? "bg-red-500"
                : provider.remainingQuota <= 2
                  ? "bg-amber-500"
                  : "bg-green-500"
            }`}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {provider.currentMonthAllocated} received this month
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Leads received
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {provider.assignmentCount}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            All-time
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {provider.totalAllocationsAllTime}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Assigned leads
        </p>
        {provider.assignedLeads.length === 0 ? (
          <p className="text-sm text-slate-500">No leads yet</p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {provider.assignedLeads.map((lead) => (
              <li
                key={lead.assignmentId}
                className="rounded border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <p className="font-medium text-slate-900">{lead.customerName}</p>
                <p className="text-slate-600">
                  {lead.customerPhone} · {lead.serviceName}
                  {lead.city ? ` · ${lead.city}` : ""}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(lead.assignedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ProvidersDashboard() {
  const [providers, setProviders] = useState<ProviderDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<ProviderUpdate | null>(null);

  const loadProviders = useCallback(async () => {
    const response = await fetch("/api/providers/dashboard");
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error("Failed to load providers");
    }
    setProviders(payload.data);
  }, []);

  useEffect(() => {
    loadProviders()
      .catch(() => setProviders([]))
      .finally(() => setLoading(false));
  }, [loadProviders]);

  const handleUpdate = useCallback(
    (update: ProviderUpdate) => {
      setLastUpdate(update);
      void loadProviders();
    },
    [loadProviders],
  );

  const { isConnected } = useProviderUpdates(handleUpdate);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Provider Dashboard</h1>
            <p className="mt-2 text-slate-600">
              Live quota, lead counts, and assigned leads from the database
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-amber-500"}`}
            />
            <span className="text-sm text-slate-600">
              {isConnected ? "Live" : "Reconnecting…"}
            </span>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          {lastUpdate && (
            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-900">
                New lead assigned to {lastUpdate.allocatedProviders.length}{" "}
                provider(s) — dashboard refreshed automatically.
              </p>
            </div>
          )}

          {loading ? (
            <p className="text-center text-slate-600">Loading…</p>
          ) : providers.length === 0 ? (
            <p className="text-center text-slate-600">
              No providers found. Run npm run prisma:seed.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
