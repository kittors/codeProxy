import { expect, test, type Page } from "@playwright/test";

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.api-keys");
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v1.api-keys");
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

const mockApiKeysApis = async (page: Page) => {
  const entries = [
    {
      key: "sk-e2e-limited-model-summary-1234567890",
      name: "Limited Models",
      "allowed-models": [
        "deepseek-v4-flash-ultra-long-model-name",
        "deepseek-v4-pro",
        "kimi-k2.5",
        "kimi-k2.6",
      ],
      "allowed-channel-groups": ["all-channel-groups-with-a-long-name"],
      "allowed-channels": ["primary-channel-with-a-long-name"],
      "created-at": "2026-05-13T15:32:00Z",
    },
  ];

  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith("/v0/management/config")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    if (pathname.endsWith("/v0/management/api-key-entries")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "api-key-entries": entries }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/api-keys")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "api-keys": [] }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/api-key-permission-profiles")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "api-key-permission-profiles": [] }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/ccswitch-import-configs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "ccswitch-import-configs": [] }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/channel-groups")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/models")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    if (pathname.endsWith("/v0/management/auth-files")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: [] }),
      });
      return;
    }

    const providerListPayloads: Record<string, Record<string, unknown[]>> = {
      "/v0/management/gemini-api-key": { "gemini-api-key": [] },
      "/v0/management/claude-api-key": { "claude-api-key": [] },
      "/v0/management/codex-api-key": { "codex-api-key": [] },
      "/v0/management/vertex-api-key": { "vertex-api-key": [] },
      "/v0/management/openai-compatibility": { "openai-compatibility": [] },
    };
    const providerPayload = providerListPayloads[pathname];
    if (providerPayload) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(providerPayload),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

test("API Keys: limited model summary truncates inside the rounded pill", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1180 });
  await setAuthed(page);
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  await page.locator('td[data-vt-column-key="allowedModels"]').waitFor({ state: "visible" });

  const summaryState = await page.evaluate(() => {
    const cell = document.querySelector<HTMLElement>('td[data-vt-column-key="allowedModels"]');
    const tooltip = cell?.querySelector<HTMLElement>("[data-tooltip-managed='true']");
    const pill = tooltip?.querySelector<HTMLElement>(".rounded-full.border");
    const count = pill?.querySelector<HTMLElement>(".tabular-nums");
    const text = pill?.querySelector<HTMLElement>(".truncate");

    if (!cell || !tooltip || !pill || !count || !text) {
      throw new Error("Missing limited model summary elements");
    }

    const cellRect = cell.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const countRect = count.getBoundingClientRect();
    const textRect = text.getBoundingClientRect();
    const pillStyle = getComputedStyle(pill);

    return {
      cellRight: cellRect.right,
      tooltipRight: tooltipRect.right,
      pillLeft: pillRect.left,
      pillRight: pillRect.right,
      countLeft: countRect.left,
      countRight: countRect.right,
      textLeft: textRect.left,
      textRight: textRect.right,
      textClientWidth: text.clientWidth,
      textScrollWidth: text.scrollWidth,
      borderRightWidth: pillStyle.borderRightWidth,
      borderTopRightRadius: pillStyle.borderTopRightRadius,
      visibleText: text.textContent?.trim() ?? "",
    };
  });

  expect(summaryState.visibleText).toBe("deepseek-v4-flash-ultra-long-model-name");
  expect(summaryState.tooltipRight).toBeLessThanOrEqual(summaryState.cellRight + 1);
  expect(summaryState.pillRight).toBeLessThanOrEqual(summaryState.cellRight + 1);
  expect(summaryState.countLeft).toBeGreaterThanOrEqual(summaryState.pillLeft - 1);
  expect(summaryState.countRight).toBeLessThanOrEqual(summaryState.pillRight + 1);
  expect(summaryState.textLeft).toBeGreaterThanOrEqual(summaryState.pillLeft - 1);
  expect(summaryState.textRight).toBeLessThanOrEqual(summaryState.pillRight + 1);
  expect(summaryState.textScrollWidth).toBeGreaterThan(summaryState.textClientWidth);
  expect(summaryState.borderRightWidth).toBe("1px");
  expect(Number.parseFloat(summaryState.borderTopRightRadius)).toBeGreaterThan(0);
});
