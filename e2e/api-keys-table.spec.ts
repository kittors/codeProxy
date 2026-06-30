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
  const entries = Array.from({ length: 9 }, (_, index) => {
    const suffixes = ["whc", "0zb", "1ll", "soe", "3fv", "7om", "lmk", "cyj", "bex"];
    return {
      key: `sk-e2e-${"x".repeat(24)}-${suffixes[index]}`,
      name: index === 0 ? "Limited Models" : `Fixed Row ${index + 1}`,
      "allowed-models": [
        "deepseek-v4-flash-ultra-long-model-name",
        "deepseek-v4-pro",
        "kimi-k2.5",
        "kimi-k2.6",
      ],
      "allowed-channel-groups": ["all-channel-groups-with-a-long-name"],
      "allowed-channels": ["primary-channel-with-a-long-name"],
      "created-at": "2026-05-13T15:32:00Z",
      ...(index % 5 === 4 ? { "daily-limit": 800 } : {}),
      ...(index === 8 ? { "total-quota": 2000 } : {}),
    };
  });

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
  await page
    .locator('td[data-vt-column-key="allowedModels"]')
    .first()
    .waitFor({ state: "visible" });

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

test("API Keys: resize preview does not paint over the fixed action column", async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 980 });
  await setAuthed(page);
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  await page.locator('td[data-vt-column-key="actions"]').first().waitFor({ state: "visible" });

  await page.evaluate(async () => {
    const scrollContent = document.querySelector<HTMLElement>("[data-vt-scroll-content]");
    const container = scrollContent?.parentElement;
    if (!container) throw new Error("Missing API keys table viewport");

    container.scrollLeft = container.scrollWidth - container.clientWidth;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

  const header = page.locator('th[data-vt-column-key="createdAt"]');
  await header.waitFor({ state: "visible" });

  const dragStart = await header.locator("[data-vt-column-resizer]").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const headerRect = element.closest("th")?.getBoundingClientRect();
    const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
    const actionsRect = actionsHeader?.getBoundingClientRect();
    if (!headerRect || !actionsRect) throw new Error("Missing resize rail geometry");

    return {
      x: Math.min(rect.left + rect.width / 2, headerRect.right - 2),
      y: rect.top + rect.height / 2,
      actionsLeft: actionsRect.left,
      actionsRight: actionsRect.right,
    };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.actionsLeft + 80, dragStart.y, { steps: 8 });

  const previewLine = page.locator("[data-vt-column-resize-preview-line]");
  await previewLine.waitFor({ state: "attached" });

  const hiddenState = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>("[data-vt-column-resize-preview-line]");
    const tooltip = document.querySelector<HTMLElement>("[data-vt-column-resize-preview-tooltip]");
    const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
    if (!line || !tooltip || !actionsHeader) throw new Error("Missing resize preview state");

    const actionsRect = actionsHeader.getBoundingClientRect();
    return {
      previewCenter: Number.parseFloat(line.style.left) + 1,
      actionsLeft: actionsRect.left,
      actionsRight: actionsRect.right,
      lineDisplay: getComputedStyle(line).display,
      tooltipDisplay: getComputedStyle(tooltip).display,
    };
  });

  expect(hiddenState.previewCenter).toBeGreaterThan(hiddenState.actionsLeft + 1);
  expect(hiddenState.previewCenter).toBeLessThan(hiddenState.actionsRight - 1);
  expect(hiddenState.lineDisplay).toBe("none");
  expect(hiddenState.tooltipDisplay).toBe("none");

  await page.mouse.up();
});

test("API Keys: fixed columns do not cover the created time at the right edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1180 });
  await setAuthed(page);
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  await page
    .locator('td[data-vt-column-key="createdAt"]')
    .first()
    .waitFor({ state: "visible" });
  await expect(page.getByText(/All 9 records loaded|已加载全部 9 条记录/)).toHaveCount(0);

  const states = await page.evaluate(async () => {
    const scrollContent = document.querySelector<HTMLElement>("[data-vt-scroll-content]");
    const container = scrollContent?.parentElement;
    if (!scrollContent || !container) throw new Error("Missing API keys table viewport");

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const positions = [0, Math.round(maxScrollLeft / 2), maxScrollLeft];
    const horizontalScrollbarInset = 14;

    const states: Array<{
      scrollLeft: number;
      maxScrollLeft: number;
      createdAtRight: number;
      actionsLeft: number;
      actionsRight: number;
      containerLeft: number;
      containerRight: number;
      selectHeaderLeft: number;
      selectHeaderWidth: number;
      nameHeaderLeft: number;
      nameHeaderRight: number;
      nameHeaderWidth: number;
      actionsHeaderRight: number;
      selectCellLeft: number;
      selectCellWidth: number;
      nameCellLeft: number;
      nameCellRight: number;
      nameCellWidth: number;
      nameHeaderHitColumn: string | null;
      nameCellHitColumn: string | null;
      startRailLeft: number;
      startRailBottom: number;
      startBoundaryLeft: number;
      startBoundaryRight: number;
      startBoundaryBottom: number;
      endRailRight: number;
      endRailBottom: number;
      endBoundaryLeft: number;
      endBoundaryRight: number;
      endBoundaryBottom: number;
      fixedRailBottom: number;
      selectHeaderTopLeftRadius: number;
      actionsHeaderTopRightRadius: number;
    }> = [];
    for (const scrollLeft of positions) {
      container.scrollLeft = scrollLeft;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const createdAt = document.querySelector<HTMLElement>('td[data-vt-column-key="createdAt"]');
      const actions = document.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
      const selectHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="select"]');
      const nameHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="name"]');
      const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
      const selectCell = document.querySelector<HTMLElement>('td[data-vt-column-key="select"]');
      const nameCell = document.querySelector<HTMLElement>('td[data-vt-column-key="name"]');
      const startRail = document.querySelector<HTMLElement>("[data-vt-sticky-start-rail]");
      const endRail = document.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
      const startBoundary = document.querySelector<HTMLElement>(
        "[data-vt-sticky-start-boundary]",
      );
      const endBoundary = document.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
      if (
        !createdAt ||
        !actions ||
        !selectHeader ||
        !nameHeader ||
        !actionsHeader ||
        !selectCell ||
        !nameCell ||
        !startRail ||
        !endRail ||
        !startBoundary ||
        !endBoundary
      ) {
        throw new Error("Missing fixed-column geometry");
      }

      const createdAtRect = createdAt.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const selectHeaderRect = selectHeader.getBoundingClientRect();
      const nameHeaderRect = nameHeader.getBoundingClientRect();
      const actionsHeaderRect = actionsHeader.getBoundingClientRect();
      const selectCellRect = selectCell.getBoundingClientRect();
      const nameCellRect = nameCell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const startRailRect = startRail.getBoundingClientRect();
      const endRailRect = endRail.getBoundingClientRect();
      const startBoundaryRect = startBoundary.getBoundingClientRect();
      const endBoundaryRect = endBoundary.getBoundingClientRect();
      const selectHeaderStyle = getComputedStyle(selectHeader);
      const actionsHeaderStyle = getComputedStyle(actionsHeader);
      const nameHeaderHit = document.elementFromPoint(
        nameHeaderRect.right - 8,
        nameHeaderRect.top + nameHeaderRect.height / 2,
      );
      const nameCellHit = document.elementFromPoint(
        nameCellRect.right - 8,
        nameCellRect.top + nameCellRect.height / 2,
      );

      states.push({
        scrollLeft,
        maxScrollLeft,
        createdAtRight: createdAtRect.right,
        actionsLeft: actionsRect.left,
        actionsRight: actionsRect.right,
        containerLeft: containerRect.left,
        containerRight: containerRect.right,
        selectHeaderLeft: selectHeaderRect.left,
        selectHeaderWidth: selectHeaderRect.width,
        nameHeaderLeft: nameHeaderRect.left,
        nameHeaderRight: nameHeaderRect.right,
        nameHeaderWidth: nameHeaderRect.width,
        actionsHeaderRight: actionsHeaderRect.right,
        selectCellLeft: selectCellRect.left,
        selectCellWidth: selectCellRect.width,
        nameCellLeft: nameCellRect.left,
        nameCellRight: nameCellRect.right,
        nameCellWidth: nameCellRect.width,
        nameHeaderHitColumn:
          nameHeaderHit?.closest<HTMLElement>("[data-vt-column-key]")?.dataset.vtColumnKey ?? null,
        nameCellHitColumn:
          nameCellHit?.closest<HTMLElement>("[data-vt-column-key]")?.dataset.vtColumnKey ?? null,
        startRailLeft: startRailRect.left,
        startRailBottom: startRailRect.bottom,
        startBoundaryLeft: startBoundaryRect.left,
        startBoundaryRight: startBoundaryRect.right,
        startBoundaryBottom: startBoundaryRect.bottom,
        endRailRight: endRailRect.right,
        endRailBottom: endRailRect.bottom,
        endBoundaryLeft: endBoundaryRect.left,
        endBoundaryRight: endBoundaryRect.right,
        endBoundaryBottom: endBoundaryRect.bottom,
        fixedRailBottom: containerRect.bottom - horizontalScrollbarInset,
        selectHeaderTopLeftRadius: Number.parseFloat(selectHeaderStyle.borderTopLeftRadius),
        actionsHeaderTopRightRadius: Number.parseFloat(actionsHeaderStyle.borderTopRightRadius),
      });
    }

    return states;
  });

  for (const state of states) {
    const expectedHeaderNameLeft = state.containerLeft + state.selectHeaderWidth;
    const expectedHeaderNameRight = expectedHeaderNameLeft + state.nameHeaderWidth;
    const expectedCellNameLeft = state.containerLeft + state.selectCellWidth;
    const expectedCellNameRight = expectedCellNameLeft + state.nameCellWidth;

    expect(state.startRailLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
    expect(state.startRailLeft).toBeLessThanOrEqual(state.containerLeft + 1);
    expect(state.endRailRight).toBeGreaterThanOrEqual(state.containerRight - 1);
    expect(state.endRailRight).toBeLessThanOrEqual(state.containerRight + 1);
    expect(state.startBoundaryLeft).toBeGreaterThanOrEqual(expectedHeaderNameRight - 2);
    expect(state.startBoundaryRight).toBeLessThanOrEqual(expectedHeaderNameRight + 1);
    expect(state.endBoundaryLeft).toBeGreaterThanOrEqual(state.actionsLeft - 1);
    expect(state.endBoundaryLeft).toBeLessThanOrEqual(state.actionsLeft + 1);
    expect(state.endBoundaryRight).toBeGreaterThanOrEqual(state.actionsLeft);
    expect(state.endBoundaryRight).toBeLessThanOrEqual(state.actionsLeft + 2);
    expect(state.selectHeaderLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
    expect(state.selectHeaderLeft).toBeLessThanOrEqual(state.containerLeft + 1);
    expect(state.nameHeaderLeft).toBeGreaterThanOrEqual(expectedHeaderNameLeft - 1);
    expect(state.nameHeaderLeft).toBeLessThanOrEqual(expectedHeaderNameLeft + 1);
    expect(state.nameHeaderRight).toBeGreaterThanOrEqual(expectedHeaderNameRight - 1);
    expect(state.nameHeaderRight).toBeLessThanOrEqual(expectedHeaderNameRight + 1);
    expect(state.actionsHeaderRight).toBeGreaterThanOrEqual(state.containerRight - 1);
    expect(state.actionsHeaderRight).toBeLessThanOrEqual(state.containerRight + 1);
    expect(state.selectCellLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
    expect(state.selectCellLeft).toBeLessThanOrEqual(state.containerLeft + 1);
    expect(state.nameCellLeft).toBeGreaterThanOrEqual(expectedCellNameLeft - 1);
    expect(state.nameCellLeft).toBeLessThanOrEqual(expectedCellNameLeft + 1);
    expect(state.nameCellRight).toBeGreaterThanOrEqual(expectedCellNameRight - 1);
    expect(state.nameCellRight).toBeLessThanOrEqual(expectedCellNameRight + 1);
    expect(state.actionsRight).toBeGreaterThanOrEqual(state.containerRight - 1);
    expect(state.actionsRight).toBeLessThanOrEqual(state.containerRight + 1);
    expect(state.nameHeaderHitColumn).toBe("name");
    expect(state.nameCellHitColumn).toBe("name");
    expect(state.startRailBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
    expect(state.endRailBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
    expect(state.startBoundaryBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
    expect(state.endBoundaryBottom).toBeGreaterThanOrEqual(state.fixedRailBottom - 1);
    expect(state.selectHeaderTopLeftRadius).toBeGreaterThan(0);
    expect(state.actionsHeaderTopRightRadius).toBeGreaterThan(0);
  }

  const maxScrollState = states.at(-1);
  expect(maxScrollState?.scrollLeft).toBe(maxScrollState?.maxScrollLeft);
  expect(maxScrollState?.createdAtRight).toBeLessThanOrEqual(
    (maxScrollState?.actionsLeft ?? 0) + 1,
  );
});

test("API Keys: fixed columns stay pinned while dragging the horizontal scrollbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1180 });
  await setAuthed(page);
  await mockApiKeysApis(page);

  await page.goto("/#/api-keys");
  await page.locator('td[data-vt-column-key="name"]').first().waitFor({ state: "visible" });

  const thumb = page.locator('[data-vt-scrollbar="x"] [role="presentation"]');
  const dragStart = await thumb.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 120, dragStart.y, { steps: 12 });

  const state = await page.evaluate(() => {
    const scrollContent = document.querySelector<HTMLElement>("[data-vt-scroll-content]");
    const container = scrollContent?.parentElement;
    const selectHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="select"]');
    const nameHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="name"]');
    const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
    const selectCell = document.querySelector<HTMLElement>('td[data-vt-column-key="select"]');
    const nameCell = document.querySelector<HTMLElement>('td[data-vt-column-key="name"]');
    const actionsCell = document.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
    const startRail = document.querySelector<HTMLElement>("[data-vt-sticky-start-rail]");
    const endRail = document.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
    const startBoundary = document.querySelector<HTMLElement>("[data-vt-sticky-start-boundary]");
    const endBoundary = document.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
    if (
      !container ||
      !selectHeader ||
      !nameHeader ||
      !actionsHeader ||
      !selectCell ||
      !nameCell ||
      !actionsCell ||
      !startRail ||
      !endRail ||
      !startBoundary ||
      !endBoundary
    ) {
      throw new Error("Missing fixed-column drag geometry");
    }

    const containerRect = container.getBoundingClientRect();
    const selectHeaderRect = selectHeader.getBoundingClientRect();
    const nameHeaderRect = nameHeader.getBoundingClientRect();
    const actionsHeaderRect = actionsHeader.getBoundingClientRect();
    const selectCellRect = selectCell.getBoundingClientRect();
    const nameCellRect = nameCell.getBoundingClientRect();
    const actionsCellRect = actionsCell.getBoundingClientRect();
    const startRailRect = startRail.getBoundingClientRect();
    const endRailRect = endRail.getBoundingClientRect();
    const startBoundaryRect = startBoundary.getBoundingClientRect();
    const endBoundaryRect = endBoundary.getBoundingClientRect();
    const startRailStyle = getComputedStyle(startRail);
    const endRailStyle = getComputedStyle(endRail);
    const startBoundaryStyle = getComputedStyle(startBoundary);
    const endBoundaryStyle = getComputedStyle(endBoundary);
    const nameHeaderStyle = getComputedStyle(nameHeader);
    const actionsHeaderStyle = getComputedStyle(actionsHeader);
    const nameCellStyle = getComputedStyle(nameCell);
    const actionsCellStyle = getComputedStyle(actionsCell);
    const nameCellHit = document.elementFromPoint(
      nameCellRect.left + Math.min(24, nameCellRect.width / 2),
      nameCellRect.top + nameCellRect.height / 2,
    );
    const actionsCellHit = document.elementFromPoint(
      actionsCellRect.right - Math.min(24, actionsCellRect.width / 2),
      actionsCellRect.top + actionsCellRect.height / 2,
    );

    return {
      scrollLeft: container.scrollLeft,
      maxScrollLeft: container.scrollWidth - container.clientWidth,
      containerLeft: containerRect.left,
      containerRight: containerRect.right,
      selectHeaderLeft: selectHeaderRect.left,
      nameHeaderLeft: nameHeaderRect.left,
      actionsHeaderRight: actionsHeaderRect.right,
      selectCellLeft: selectCellRect.left,
      selectCellWidth: selectCellRect.width,
      nameCellLeft: nameCellRect.left,
      nameCellRight: nameCellRect.right,
      actionsCellLeft: actionsCellRect.left,
      actionsCellRight: actionsCellRect.right,
      startRailLeft: startRailRect.left,
      endRailRight: endRailRect.right,
      startBoundaryLeft: startBoundaryRect.left,
      startBoundaryRight: startBoundaryRect.right,
      endBoundaryLeft: endBoundaryRect.left,
      endBoundaryRight: endBoundaryRect.right,
      startRailZIndex: getComputedStyle(startRail).zIndex,
      endRailZIndex: getComputedStyle(endRail).zIndex,
      startRailTransform: startRailStyle.transform,
      endRailTransform: endRailStyle.transform,
      startRailBorderRightWidth: startRailStyle.borderRightWidth,
      endRailBorderLeftWidth: endRailStyle.borderLeftWidth,
      startBoundaryWidth: startBoundaryStyle.width,
      endBoundaryWidth: endBoundaryStyle.width,
      nameHeaderBorderRightWidth: nameHeaderStyle.borderRightWidth,
      actionsHeaderBorderLeftWidth: actionsHeaderStyle.borderLeftWidth,
      nameCellBorderRightWidth: nameCellStyle.borderRightWidth,
      actionsCellBorderLeftWidth: actionsCellStyle.borderLeftWidth,
      nameCellHitColumn:
        nameCellHit?.closest<HTMLElement>("[data-vt-column-key]")?.dataset.vtColumnKey ?? null,
      actionsCellHitColumn:
        actionsCellHit?.closest<HTMLElement>("[data-vt-column-key]")?.dataset.vtColumnKey ?? null,
    };
  });

  await page.mouse.up();

  const expectedNameLeft = state.containerLeft + state.selectCellWidth;
  expect(state.scrollLeft).toBeGreaterThan(0);
  expect(state.scrollLeft).toBeLessThan(state.maxScrollLeft);
  expect(state.startRailLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
  expect(state.startRailLeft).toBeLessThanOrEqual(state.containerLeft + 1);
  expect(state.endRailRight).toBeGreaterThanOrEqual(state.containerRight - 1);
  expect(state.endRailRight).toBeLessThanOrEqual(state.containerRight + 1);
  expect(state.startBoundaryLeft).toBeGreaterThanOrEqual(state.nameCellRight - 2);
  expect(state.startBoundaryRight).toBeLessThanOrEqual(state.nameCellRight + 1);
  expect(state.endBoundaryLeft).toBeGreaterThanOrEqual(state.actionsCellLeft - 1);
  expect(state.endBoundaryLeft).toBeLessThanOrEqual(state.actionsCellLeft + 1);
  expect(state.endBoundaryRight).toBeGreaterThanOrEqual(state.actionsCellLeft);
  expect(state.endBoundaryRight).toBeLessThanOrEqual(state.actionsCellLeft + 2);
  expect(state.startRailZIndex).toBe("0");
  expect(state.endRailZIndex).toBe("0");
  expect(state.startRailTransform).toBe("none");
  expect(state.endRailTransform).toBe("none");
  expect(state.startRailBorderRightWidth).toBe("0px");
  expect(state.endRailBorderLeftWidth).toBe("0px");
  expect(state.startBoundaryWidth).toBe("1px");
  expect(state.endBoundaryWidth).toBe("1px");
  expect(state.nameHeaderBorderRightWidth).toBe("1px");
  expect(state.actionsHeaderBorderLeftWidth).toBe("1px");
  expect(state.nameCellBorderRightWidth).toBe("1px");
  expect(state.actionsCellBorderLeftWidth).toBe("1px");
  expect(state.selectHeaderLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
  expect(state.selectHeaderLeft).toBeLessThanOrEqual(state.containerLeft + 1);
  expect(state.nameHeaderLeft).toBeGreaterThanOrEqual(expectedNameLeft - 1);
  expect(state.nameHeaderLeft).toBeLessThanOrEqual(expectedNameLeft + 1);
  expect(state.actionsHeaderRight).toBeGreaterThanOrEqual(state.containerRight - 1);
  expect(state.actionsHeaderRight).toBeLessThanOrEqual(state.containerRight + 1);
  expect(state.selectCellLeft).toBeGreaterThanOrEqual(state.containerLeft - 1);
  expect(state.selectCellLeft).toBeLessThanOrEqual(state.containerLeft + 1);
  expect(state.nameCellLeft).toBeGreaterThanOrEqual(expectedNameLeft - 1);
  expect(state.nameCellLeft).toBeLessThanOrEqual(expectedNameLeft + 1);
  expect(state.actionsCellRight).toBeGreaterThanOrEqual(state.containerRight - 1);
  expect(state.actionsCellRight).toBeLessThanOrEqual(state.containerRight + 1);
  expect(state.nameCellHitColumn).toBe("name");
  expect(state.actionsCellHitColumn).toBe("actions");
});
