import { ProvidersDashboard } from "@/client/components/ProvidersDashboard";

export const metadata = {
  title: "Provider Dashboard",
  description: "Live provider quota and assigned leads",
};

export default function DashboardPage() {
  return <ProvidersDashboard />;
}
