export const RealtimeEvents = {
  DashboardUpdated: "dashboard:updated",
} as const;

export type DashboardUpdatedPayload = {
  timestamp: number;
  allocatedProviders: string[];
  leadId: string;
};
