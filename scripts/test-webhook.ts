/**
 * Webhook Test Utility
 * Run with: npx ts-node scripts/test-webhook.ts
 *
 * Tests idempotency of quota reset webhook endpoint
 */

async function testWebhook() {
  const baseUrl = "http://localhost:3000";

  // Test data
  const externalId = `evt_test_${Date.now()}`;
  const payload = {
    externalId,
    eventType: "quota_reset",
    timestamp: Math.floor(Date.now() / 1000),
    source: "test_script",
    reason: "Testing idempotency",
  };

  console.log("🧪 Testing Quota Reset Webhook Idempotency\n");
  console.log("Payload:", payload);
  console.log("\n" + "=".repeat(60) + "\n");

  // Test 1: First request
  console.log("1️⃣  First Request (new webhook)");
  console.log("────────────────────────────────────");

  try {
    const response1 = await fetch(`${baseUrl}/api/webhooks/quota-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data1 = await response1.json();
    console.log(`Status: ${response1.status}`);
    console.log(`Response:`, JSON.stringify(data1, null, 2));

    if (response1.status !== 200) {
      console.error("❌ First request failed!");
      return;
    }

    const webhookEventId = data1.webhookEventId;
    const processedProviders = data1.processedProviders;

    console.log(`✅ Processed ${processedProviders} providers`);
    console.log(`✅ Webhook Event ID: ${webhookEventId}\n`);

    // Test 2: Idempotent retry (same externalId)
    console.log("2️⃣  Idempotent Retry (same externalId)");
    console.log("────────────────────────────────────");

    await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay

    const response2 = await fetch(`${baseUrl}/api/webhooks/quota-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // Same payload
    });

    const data2 = await response2.json();
    console.log(`Status: ${response2.status}`);
    console.log(`Response:`, JSON.stringify(data2, null, 2));

    if (response2.status !== 200) {
      console.error("❌ Retry request failed!");
      return;
    }

    // Verify idempotency
    if (data2.webhookEventId === webhookEventId) {
      console.log(`✅ Same webhook event ID returned (idempotent)`);
    } else {
      console.error(
        `❌ Different webhook event ID! Expected ${webhookEventId}, got ${data2.webhookEventId}`,
      );
      return;
    }

    if (data2.processedProviders === 0) {
      console.log(`✅ Zero providers processed (cached result)`);
    } else {
      console.error(
        `❌ Providers processed again! Expected 0, got ${data2.processedProviders}`,
      );
      return;
    }

    console.log("");

    // Test 3: Different externalId (new webhook)
    console.log("3️⃣  Different externalId (new webhook)");
    console.log("────────────────────────────────────");

    const newPayload = {
      ...payload,
      externalId: `evt_test_${Date.now() + 1000}`, // Different ID
    };

    const response3 = await fetch(`${baseUrl}/api/webhooks/quota-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPayload),
    });

    const data3 = await response3.json();
    console.log(`Status: ${response3.status}`);
    console.log(`Response:`, JSON.stringify(data3, null, 2));

    if (response3.status === 200 && data3.processedProviders > 0) {
      console.log(
        `✅ New webhook processed ${data3.processedProviders} providers`,
      );
      if (data3.webhookEventId !== webhookEventId) {
        console.log(`✅ Different webhook event ID created`);
      }
    } else {
      console.error("❌ New webhook request failed!");
      return;
    }

    console.log("");

    // Test 4: Validation error (missing field)
    console.log("4️⃣  Validation Error (missing externalId)");
    console.log("────────────────────────────────────");

    const invalidPayload = {
      eventType: "quota_reset",
      timestamp: Math.floor(Date.now() / 1000),
      source: "test_script",
      // Missing externalId
    };

    const response4 = await fetch(`${baseUrl}/api/webhooks/quota-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload),
    });

    const data4 = await response4.json();
    console.log(`Status: ${response4.status}`);
    console.log(`Response:`, JSON.stringify(data4, null, 2));

    if (response4.status === 400 && data4.error === "VALIDATION_ERROR") {
      console.log(`✅ Validation error returned correctly`);
    } else {
      console.error("❌ Expected validation error!");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests passed!");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

testWebhook();
