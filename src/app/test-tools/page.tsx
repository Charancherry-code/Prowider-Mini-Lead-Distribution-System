import { TestingToolsClient } from "@/client/components/TestingTools";

export const metadata = {
  title: "Testing Tools",
  description:
    "Test webhook idempotency, quota resets, and concurrent operations",
};

export default function TestingToolsPage() {
  return <TestingToolsClient />;
}
