import { expect, test, type Page } from "@playwright/test";

const API_KEYS_COLUMN_WIDTH_STORAGE_KEY = "codeProxy.dataTable.columnWidths.v1.api-keys";

type SetAuthedOptions = {
  columnWidths?: Record<string, number>;
};

const setAuthed = async (page: Page, options: SetAuthedOptions = {}) => {
  await page.addInitScript((authOptions: SetAuthedOptions) => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.api-keys");
    if (authOptions.columnWidths) {
      localStorage.setItem(
        "codeProxy.dataTable.columnWidths.v1.api-keys",
        JSON.stringify(authOptions.columnWidths),
      );
    } else {
      localStorage.removeItem("codeProxy.dataTable.columnWidths.v1.api-keys");
    }
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  }, options);
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
      pillTop: pillRect.top,
      pillRight: pillRect.right,
      pillBottom: pillRect.bottom,
      countLeft: countRect.left,
      countTop: countRect.top,
      countRight: countRect.right,
      countBottom: countRect.bottom,
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
  expect(
    Math.abs(
      summaryState.countLeft -
        summaryState.pillLeft -
        (summaryState.countTop - summaryState.pillTop),
    ),
  ).toBeLessThanOrEqual(1.5);
  expect(
    Math.abs(
      summaryState.countLeft -
        summaryState.pillLeft -
        (summaryState.pillBottom - summaryState.countBottom),
    ),
  ).toBeLessThanOrEqual(1.5);
  expect(summaryState.textLeft).toBeGreaterThanOrEqual(summaryState.pillLeft - 1);
  expect(summaryState.textRight).toBeLessThanOrEqual(summaryState.pillRight + 1);
  expect(summaryState.textScrollWidth).toBeGreaterThan(summaryState.textClientWidth);
  expect(summaryState.borderRightWidth).toBe("1px");
  expect(Number.parseFloat(summaryState.borderTopRightRadius)).toBeGreaterThan(0);
});

test("API Keys: restored wider columns keep resize preview at the minimum boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page, { columnWidths: { createdAt: 360 } });
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  const header = page.locator('th[data-vt-column-key="createdAt"]');
  await header.waitFor({ state: "visible" });
  await header.scrollIntoViewIfNeeded();
  await expect
    .poll(async () =>
      Math.round(await header.evaluate((element) => element.getBoundingClientRect().width)),
    )
    .toBeGreaterThanOrEqual(359);

  const dragStart = await header.locator("[data-vt-column-resizer]").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const headerRect = element.closest("th")?.getBoundingClientRect();
    return {
      x: headerRect ? Math.min(rect.left + rect.width / 2, headerRect.right - 2) : rect.left,
      y: rect.top + rect.height / 2,
    };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x - 640, dragStart.y, { steps: 10 });
  await page.locator("[data-vt-column-resize-preview-line]").waitFor({ state: "visible" });

  const state = await page.evaluate(() => {
    const headerElement = document.querySelector<HTMLElement>('th[data-vt-column-key="createdAt"]');
    const previewLine = document.querySelector<HTMLElement>("[data-vt-column-resize-preview-line]");
    if (!headerElement || !previewLine) throw new Error("Missing resize state");

    const headerRect = headerElement.getBoundingClientRect();
    const previewRect = previewLine.getBoundingClientRect();
    const previewCenter = previewRect.left + previewRect.width / 2;
    return {
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      headerWidth: headerRect.width,
      previewCenter,
      minBoundary: headerRect.left + 168,
    };
  });
  expect(state.previewCenter).toBeGreaterThanOrEqual(state.minBoundary - 1);
  expect(state.previewCenter).toBeLessThanOrEqual(state.minBoundary + 1);

  await page.mouse.up();

  await expect
    .poll(async () =>
      page.evaluate((storageKey) => {
        const storedWidths = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<
          string,
          unknown
        >;
        return typeof storedWidths.createdAt === "number"
          ? Math.round(storedWidths.createdAt)
          : null;
      }, API_KEYS_COLUMN_WIDTH_STORAGE_KEY),
    )
    .toBe(168);
});

test("API Keys: fixed columns do not cover the created time at the right edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1180 });
  await setAuthed(page);
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  await page.locator('td[data-vt-column-key="createdAt"]').waitFor({ state: "visible" });

  const states = await page.evaluate(async () => {
    const scrollContent = document.querySelector<HTMLElement>("[data-vt-scroll-content]");
    const container = scrollContent?.parentElement;
    if (!scrollContent || !container) throw new Error("Missing API keys table viewport");

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const positions = [Math.round(maxScrollLeft / 2), maxScrollLeft];
    const horizontalScrollbarInset = 14;

    return Promise.all(
      positions.map(async (scrollLeft) => {
        container.scrollLeft = scrollLeft;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

        const createdAt = document.querySelector<HTMLElement>(
          'td[data-vt-column-key="createdAt"]',
        );
        const actions = document.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
        const startRail = document.querySelector<HTMLElement>("[data-vt-sticky-start-rail]");
        const endRail = document.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
        if (!createdAt || !actions || !startRail || !endRail) {
          throw new Error("Missing fixed-column geometry");
        }

        const createdAtRect = createdAt.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const startRailRect = startRail.getBoundingClientRect();
        const endRailRect = endRail.getBoundingClientRect();

        return {
          createdAtRight: createdAtRect.right,
          actionsLeft: actionsRect.left,
          containerLeft: containerRect.left,
          containerRight: containerRect.right,
          startRailLeft: startRailRect.left,
          startRailBottom: startRailRect.bottom,
          endRailRight: endRailRect.right,
          endRailBottom: endRailRect.bottom,
          fixedRailBottom: containerRect.bottom - horizontalScrollbarInset,
        };
      }),
    );
  });

  for (const state of states) {
    expect(state.createdAtRight).toBeLessThanOrEqual(state.actionsLeft + 1);
    expect(state.startRailLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
    expect(state.startRailLeft).toBeLessThanOrEqual(state.containerLeft + 1);
    expect(state.endRailRight).toBeGreaterThanOrEqual(state.containerRight - 1);
    expect(state.endRailRight).toBeLessThanOrEqual(state.containerRight + 1);
    expect(state.startRailBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
    expect(state.endRailBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
  }
});
