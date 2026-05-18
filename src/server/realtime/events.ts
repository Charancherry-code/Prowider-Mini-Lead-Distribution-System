export const RealtimeEvents = {
  LeadAssigned: "lead:assigned",
  ProviderJoined: "provider:joined",
  ProviderLeft: "provider:left",
  DashboardUpdated: "dashboard:updated",
} as const;

export type LeadAssignedPayload = {
  leadId: string;
  providerId: string;
  assignmentId: string;
};

export type DashboardUpdatedPayload = {
  timestamp: number;
  allocatedProviders: string[];
  leadId: string;
};
