import { expect, test } from "@playwright/test";

const setAuthed = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  });
};

test("Request Logs: opens full detail content and switches output raw view", async ({ page }) => {
  await setAuthed(page);

  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/v0/management/usage/logs?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: 101,
            timestamp: "2026-04-14T12:00:00Z",
            api_key: "sk-test-1234567890",
            api_key_name: "Primary",
            model: "gpt-4.1",
            source: "openai",
            channel_name: "OpenAI",
            auth_index: "auth-1",
            failed: false,
            latency_ms: 1234,
            first_token_ms: 120,
            input_tokens: 12,
            output_tokens: 34,
            reasoning_tokens: 0,
            cached_tokens: 0,
            total_tokens: 46,
            cost: 0.1234,
            has_content: true,
          },
        ],
        total: 1,
        page: 1,
        size: 50,
        filters: {
          api_keys: ["sk-test-1234567890"],
          api_key_names: { "sk-test-1234567890": "Primary" },
          models: ["gpt-4.1"],
          channels: ["OpenAI"],
        },
        stats: {
          total: 1,
          success_rate: 100,
          total_tokens: 46,
        },
      }),
    });
  });

  await page.route("**/v0/management/usage/logs/101/content?part=input&format=json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 101,
        model: "gpt-4.1",
        part: "input",
        content: JSON.stringify({
          messages: [{ role: "user", content: "hello input payload" }],
        }),
      }),
    });
  });

  await page.route("**/v0/management/usage/logs/101/content?part=output&format=json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 101,
        model: "gpt-4.1",
        part: "output",
        content: JSON.stringify({
          choices: [{ message: { content: "hello output payload" } }],
        }),
      }),
    });
  });

  await page.goto("/#/monitor/request-logs");
  await expect(page.getByRole("heading", { name: "Request Logs" }).first()).toBeVisible();

  await page.getByTitle("Click to view output").click();
  await expect(page.getByText("hello output payload")).toBeVisible();

  await page.getByRole("button", { name: "Input" }).click();
  await expect(page.getByText("hello input payload")).toBeVisible();

  await page.getByTitle("Raw Data").click();
  await expect(page.locator("pre")).toContainText('"messages"');
  await expect(page.locator("pre")).toContainText("hello input payload");
});
