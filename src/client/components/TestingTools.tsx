"use client";

import { useState } from "react";
import { useEffect } from "react";

interface TestResult {
  test: string;
  status: "pending" | "success" | "error";
  message: string;
  duration?: number;
  details?: Record<string, unknown>;
}

export function TestingToolsClient() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState<string>("");

  const addResult = (result: TestResult) => {
    setResults((prev) => [result, ...prev]);
  };

  const clearResults = () => {
    setResults([]);
  };

  useEffect(() => {
    const loadServices = async () => {
      try {
        const response = await fetch("/api/services");
        const payload = await response.json();

        if (response.ok && payload.success && payload.data.length > 0) {
          setServiceId(payload.data[0].id);
          setServiceName(payload.data[0].name);
        }
      } catch {
        setServiceId(null);
      }
    };

    void loadServices();
  }, []);

  // Test 1: Reset Provider Quotas
  const testResetQuotas = async () => {
    setLoading(true);
    const startTime = Date.now();
    addResult({
      test: "Reset Provider Quotas",
      status: "pending",
      message: "Executing...",
    });

    try {
      const externalId = `evt_test_reset_${Date.now()}`;
      const response = await fetch("/api/webhooks/quota-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId,
          eventType: "quota_reset",
          timestamp: Math.floor(Date.now() / 1000),
          source: "testing_tools",
          reason: "Manual test",
        }),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (response.ok) {
        addResult({
          test: "Reset Provider Quotas",
          status: "success",
          message: `Reset quotas for ${data.processedProviders} providers`,
          duration,
          details: {
            webhookEventId: data.webhookEventId,
            processedProviders: data.processedProviders,
            externalId,
          },
        });
      } else {
        throw new Error(data.message || "Failed to reset quotas");
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      addResult({
        test: "Reset Provider Quotas",
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        duration,
      });
    } finally {
      setLoading(false);
    }
  };

  // Test 2: Trigger Same Webhook Multiple Times (Idempotency)
  const testWebhookIdempotency = async () => {
    setLoading(true);
    const startTime = Date.now();
    addResult({
      test: "Webhook Idempotency (3x)",
      status: "pending",
      message: "Executing 3 identical webhook requests...",
    });

    try {
      const externalId = `evt_idempotency_${Date.now()}`;
      const payload = {
        externalId,
        eventType: "quota_reset",
        timestamp: Math.floor(Date.now() / 1000),
        source: "testing_tools",
        reason: "Idempotency test",
      };

      // Send 3 identical requests concurrently
      const requests = [1, 2, 3].map(() =>
        fetch("/api/webhooks/quota-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );

      const responses = await Promise.all(requests);
      const responseData = await Promise.all(responses.map((r) => r.json()));

      const duration = Date.now() - startTime;

      // Verify idempotency
      const webhookIds = responseData.map((d) => d.webhookEventId);
      const allSameId = webhookIds.every((id) => id === webhookIds[0]);
      const providersReset = responseData.map((d) => d.processedProviders);

      if (
        allSameId &&
        providersReset[0] > 0 &&
        providersReset[1] === 0 &&
        providersReset[2] === 0
      ) {
        addResult({
          test: "Webhook Idempotency (3x)",
          status: "success",
          message: "✅ Idempotency verified: same webhook ID, zero duplicates",
          duration,
          details: {
            request1: {
              webhookId: webhookIds[0],
              processedProviders: providersReset[0],
            },
            request2: {
              webhookId: webhookIds[1],
              processedProviders: providersReset[1],
              cached: true,
            },
            request3: {
              webhookId: webhookIds[2],
              processedProviders: providersReset[2],
              cached: true,
            },
          },
        });
      } else {
        throw new Error(
          "Idempotency check failed: webhook IDs or provider counts don't match expected pattern",
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      addResult({
        test: "Webhook Idempotency (3x)",
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        duration,
      });
    } finally {
      setLoading(false);
    }
  };

  // Test 3: Generate 10 Leads Simultaneously
  const testGenerateLeads = async () => {
    setLoading(true);
    const startTime = Date.now();
    addResult({
      test: "Generate 10 Leads (Concurrent)",
      status: "pending",
          message: "Creating & allocating 10 leads concurrently...",
    });

    try {
      if (!serviceId) {
        throw new Error("No service available. Seed the database first.");
      }

      // Use Service 1 for testing
      const response = await fetch("/api/test/generate-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: 10,
          serviceId,
        }),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (response.ok && data.success) {
        const successRate = Math.round(
          (data.summary.successful / data.summary.totalRequests) * 100,
        );

        addResult({
          test: "Generate 10 Leads (Concurrent)",
          status: data.summary.failed === 0 ? "success" : "error",
          message:
            data.summary.failed === 0
              ? `✅ ${data.summary.successful} leads created & allocated (3 providers each) in ${data.summary.totalTimeMs}ms`
              : `⚠️ ${data.summary.successful}/${data.summary.totalRequests} succeeded (${successRate}%)`,
          duration,
          details: {
            ...data.summary,
            exampleResults: data.results.slice(0, 3),
            serviceId,
            serviceName,
          },
        });
      } else {
        throw new Error(data.error || "Failed to generate leads");
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      addResult({
        test: "Generate 10 Leads (Concurrent)",
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        duration,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold text-slate-900">Testing Tools</h1>
          <p className="mt-2 text-slate-600">
            Run tests to verify webhook idempotency, quota resets, and
            concurrent lead generation
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {serviceId
              ? `Using service: ${serviceName} (${serviceId})`
              : "Loading service list..."}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Test Buttons */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              onClick={testResetQuotas}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 disabled:bg-slate-400 transition-colors"
            >
              💾 Reset Quotas
            </button>

            <button
              onClick={testWebhookIdempotency}
              disabled={loading}
              className="rounded-lg bg-purple-600 px-6 py-3 text-white font-medium hover:bg-purple-700 disabled:bg-slate-400 transition-colors"
            >
              🔄 Test Idempotency (3x)
            </button>

            <button
              onClick={testGenerateLeads}
              disabled={loading || !serviceId}
              className="rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700 disabled:bg-slate-400 transition-colors"
            >
              ⚡ Generate 10 Leads
            </button>
          </div>

          {/* Clear Results Button */}
          {results.length > 0 && (
            <div className="mb-8">
              <button
                onClick={clearResults}
                className="text-sm text-slate-600 hover:text-slate-900 underline"
              >
                Clear Results
              </button>
            </div>
          )}

          {/* Results */}
          <div className="space-y-4">
            {results.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
                <p className="text-slate-600">
                  Click a button above to run a test. Results will appear here.
                </p>
              </div>
            ) : (
              results.map((result, index) => (
                <TestResultCard key={index} result={result} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Result Card Component
 */
function TestResultCard({ result }: { result: TestResult }) {
  const statusColors = {
    pending: "bg-blue-50 border-blue-200",
    success: "bg-green-50 border-green-200",
    error: "bg-red-50 border-red-200",
  };

  const statusIcons = {
    pending: "⏳",
    success: "✅",
    error: "❌",
  };

  const textColors = {
    pending: "text-blue-900",
    success: "text-green-900",
    error: "text-red-900",
  };

  return (
    <div className={`rounded-lg border p-6 ${statusColors[result.status]}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-2xl">{statusIcons[result.status]}</span>
          <div>
            <h3 className={`font-semibold ${textColors[result.status]}`}>
              {result.test}
            </h3>
            <p className={`text-sm mt-1 ${textColors[result.status]}`}>
              {result.message}
            </p>
          </div>
        </div>
        {result.duration && (
          <div className="text-right">
            <p className={`text-sm font-mono ${textColors[result.status]}`}>
              {result.duration}ms
            </p>
          </div>
        )}
      </div>

      {/* Details */}
      {result.details && (
        <div className="mt-4 rounded bg-white bg-opacity-50 p-4">
          <pre className="text-xs overflow-auto max-h-48 font-mono text-slate-700">
            {JSON.stringify(result.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
