import { expect, test, type Page } from "@playwright/test";

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.request-logs");
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v1.request-logs");
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

const mockRequestLogsApis = async (page: Page) => {
  await page.route("**/v0/management/**", async (route) => {
    const url = route.request().url();

    if (url.includes("/v0/management/usage/logs?")) {
      const items = Array.from({ length: 12 }, (_, index) => ({
        id: 2000 + index,
        timestamp: `2026-06-14T08:${String(index).padStart(2, "0")}:00Z`,
        api_key: `sk-test-${String(index).padStart(4, "0")}-extra-long-key-for-drag-visual-qa`,
        api_key_name: `QA Key ${index + 1} with deliberately long display name`,
        model: index % 2 ? "claude-sonnet-4-extra-long-context" : "gpt-4.1-long-output-model",
        source: "openai",
        channel_name: index % 2 ? "Anthropic long provider channel" : "OpenAI fallback channel",
        auth_index: `auth-${index + 1}`,
        failed: index === 4,
        streaming: true,
        latency_ms: 850 + index * 120,
        first_token_ms: 90 + index * 8,
        input_tokens: 120 + index,
        output_tokens: 240 + index * 3,
        reasoning_tokens: 0,
        cached_tokens: index % 3 === 0 ? 40 : 0,
        total_tokens: 360 + index * 4,
        cost: 0.0123 + index * 0.001,
        has_content: true,
      }));

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items,
          total: items.length,
          page: 1,
          size: 50,
          filters: {
            api_keys: items.map((item) => item.api_key),
            api_key_names: Object.fromEntries(
              items.map((item) => [item.api_key, item.api_key_name]),
            ),
            models: ["gpt-4.1", "claude-sonnet-4"],
            channels: ["OpenAI", "Anthropic"],
          },
          stats: {
            total: items.length,
            success_rate: 91.7,
            total_tokens: 4560,
            total_cost: 0.42,
            cache_rate: 18.5,
          },
        }),
      });
      return;
    }

    if (url.endsWith("/v0/management/config")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

const readTableState = async (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector(".table-scrollbar");
    return {
      order: [...document.querySelectorAll("th[data-vt-column-key]")].map((th) =>
        th.getAttribute("data-vt-column-key"),
      ),
      scrollLeft: scroller?.scrollLeft ?? 0,
      scrollWidth: scroller?.scrollWidth ?? 0,
      clientWidth: scroller?.clientWidth ?? 0,
      draggingCells: document.querySelectorAll("[data-vt-column-dragging-cell]").length,
      shiftedCells: document.querySelectorAll("[data-vt-column-shifted-cell]").length,
      settledCells: document.querySelectorAll("[data-vt-column-settled-cell]").length,
      storedOrder: localStorage.getItem("codeProxy.dataTable.columnOrder.v1.request-logs"),
    };
  });

const scrollTableNearRightEdge = async (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".table-scrollbar");
    if (!scroller) throw new Error("Missing table scroller");
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.max(0, maxScrollLeft - 120);
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      maxScrollLeft,
      scrollLeft: scroller.scrollLeft,
    };
  });

const readDragVisualState = async (page: Page) =>
  page.evaluate(() => {
    const isOpaque = (style: CSSStyleDeclaration, inlineBackground: string) =>
      style.backgroundColor !== "rgba(0, 0, 0, 0)" || inlineBackground.includes("rgb(");
    const readStyles = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          boxShadow: style.boxShadow,
          inlineBackground: element.style.background,
          isOpaque: isOpaque(style, element.style.background),
          borderTopLeftRadius: style.borderTopLeftRadius,
          borderTopRightRadius: style.borderTopRightRadius,
          borderBottomLeftRadius: style.borderBottomLeftRadius,
          borderBottomRightRadius: style.borderBottomRightRadius,
          opacity: style.opacity,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          zIndex: style.zIndex,
        };
      });
    const contentClips = [
      ...document.querySelectorAll<HTMLElement>(
        "td[data-vt-column-key] > [data-vt-cell-content-clip]",
      ),
    ];
    return {
      dragging: readStyles("[data-vt-column-dragging-cell]"),
      shifted: readStyles("[data-vt-column-shifted-cell]"),
      contentClipCount: contentClips.length,
      contentClipsAreBounded: contentClips.every((element) => {
        const parent = element.parentElement;
        if (!parent) return false;
        const rect = element.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          style.overflowX === "hidden" &&
          style.overflowY === "hidden" &&
          rect.left >= parentRect.left - 1 &&
          rect.right <= parentRect.right + 1
        );
      }),
      inlineStylesCleared: [
        ...document.querySelectorAll<HTMLElement>("[data-vt-column-key]"),
      ].every(
        (element) =>
          !element.hasAttribute("data-vt-column-dragging-cell") &&
          !element.hasAttribute("data-vt-column-shifted-cell") &&
          element.style.background === "" &&
          element.style.overflow === "" &&
          element.style.contain === "" &&
          element.style.isolation === "" &&
          element.style.borderRadius === "",
      ),
    };
  });

const readSettleVisualState = async (page: Page) =>
  page.evaluate(() => {
    const cells = [...document.querySelectorAll<HTMLElement>("[data-vt-column-settled-cell]")];
    return {
      count: cells.length,
      columnKeys: cells.map((element) => element.dataset.vtColumnKey),
      headerKeys: cells
        .filter((element) => element.tagName === "TH")
        .map((element) => element.dataset.vtColumnKey),
      styles: cells.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        };
      }),
    };
  });

const readResponseMetricsColumnState = async (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('th[data-vt-column-key="latency"]');
    const firstCell = document.querySelector<HTMLElement>('td[data-vt-column-key="latency"]');
    if (!header || !firstCell) throw new Error("Missing response metrics column");

    const cellRect = firstCell.getBoundingClientRect();
    const chips = [...firstCell.querySelectorAll<HTMLElement>(".rounded-full")].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        text: element.textContent?.trim() ?? "",
        left: rect.left,
        right: rect.right,
      };
    });
    const storedWidths = JSON.parse(
      localStorage.getItem("codeProxy.dataTable.columnWidths.v1.request-logs") ?? "{}",
    ) as Record<string, unknown>;

    return {
      width: Math.round(header.getBoundingClientRect().width),
      text: firstCell.textContent?.trim() ?? "",
      chipsStayInsideCell: chips.every(
        (chip) => chip.left >= cellRect.left - 1 && chip.right <= cellRect.right + 1,
      ),
      storedLatencyWidth:
        typeof storedWidths.latency === "number" ? Math.round(storedWidths.latency) : null,
    };
  });

test("Request Logs: response metrics column resize clamps at its minimum width", async ({
  page,
}) => {
  await setAuthed(page);
  await mockRequestLogsApis(page);

  await page.goto("/manage/#/monitor/request-logs");
  await page.locator('th[data-vt-column-key="latency"]').waitFor({ state: "visible" });

  const dragStart = await page
    .locator('th[data-vt-column-key="latency"] [data-vt-column-resizer]')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const headerRect = element.closest("th")?.getBoundingClientRect();
      return {
        x: headerRect ? Math.min(rect.left + rect.width / 2, headerRect.right - 2) : rect.left,
        y: rect.top + rect.height / 2,
      };
    });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x - 520, dragStart.y, { steps: 10 });
  await page.waitForTimeout(80);

  const during = await readResponseMetricsColumnState(page);
  expect(during.width).toBeGreaterThanOrEqual(239);
  expect(during.width).toBeLessThanOrEqual(241);
  expect(during.text).toMatch(/Streaming|流式/);
  expect(during.text).toMatch(/First Token|首 Token/);
  expect(during.text).toContain("90ms");
  expect(during.text).not.toContain("--");
  expect(during.chipsStayInsideCell).toBe(true);

  await page.mouse.up();

  const after = await readResponseMetricsColumnState(page);
  expect(after.storedLatencyWidth).toBe(240);
});

test("Request Logs: column reorder follows the pointer and auto-scrolls horizontally", async ({
  page,
}) => {
  await setAuthed(page);
  await mockRequestLogsApis(page);

  await page.goto("/manage/#/monitor/request-logs");
  await page.locator('th[data-vt-column-key="timestamp"]').waitFor({ state: "visible" });

  const before = await readTableState(page);
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);

  const dragStart = await page
    .locator('th[data-vt-column-key="timestamp"] [data-vt-column-reorder-handle]')
    .evaluate((element) => {
      if (element.hasAttribute("title") || element.hasAttribute("aria-label")) {
        throw new Error("Column reorder handle must not expose hover tooltip attributes");
      }
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  const scrollerRect = await page.locator(".table-scrollbar").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { right: rect.right };
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.waitForTimeout(230);
  await page.mouse.move(scrollerRect.right - 10, dragStart.y, { steps: 12 });
  await page.waitForTimeout(520);

  const during = await readTableState(page);
  expect(during.draggingCells).toBeGreaterThan(0);
  expect(during.shiftedCells).toBeGreaterThan(0);
  expect(during.scrollLeft).toBeGreaterThan(before.scrollLeft);
  const visualDuringDrag = await readDragVisualState(page);
  expect(visualDuringDrag.dragging.length).toBeGreaterThan(0);
  expect(visualDuringDrag.shifted.length).toBeGreaterThan(0);
  expect(
    visualDuringDrag.dragging.every(
      (style) =>
        style.opacity === "1" &&
        style.overflowX === "hidden" &&
        style.overflowY === "hidden" &&
        style.isOpaque &&
        style.borderTopLeftRadius === "0px" &&
        style.borderTopRightRadius === "0px" &&
        style.borderBottomLeftRadius === "0px" &&
        style.borderBottomRightRadius === "0px" &&
        style.backgroundImage.includes("gradient") &&
        style.boxShadow !== "none" &&
        Number(style.zIndex) >= 90,
    ),
  ).toBe(true);
  expect(
    visualDuringDrag.shifted.every(
      (style) =>
        style.opacity === "1" &&
        style.overflowX === "hidden" &&
        style.overflowY === "hidden" &&
        style.isOpaque &&
        style.borderTopLeftRadius === "0px" &&
        style.borderTopRightRadius === "0px" &&
        style.borderBottomLeftRadius === "0px" &&
        style.borderBottomRightRadius === "0px" &&
        Number(style.zIndex) >= 45,
    ),
  ).toBe(true);
  expect(visualDuringDrag.contentClipCount).toBeGreaterThan(0);
  expect(visualDuringDrag.contentClipsAreBounded).toBe(true);

  await page.mouse.up();

  await expect
    .poll(async () => {
      const state = await readTableState(page);
      return state.order.at(-1);
    })
    .toBe("timestamp");

  const after = await readTableState(page);
  expect(after.draggingCells).toBe(0);
  expect(after.shiftedCells).toBe(0);
  expect(after.storedOrder).toContain('"timestamp"');
  expect(after.settledCells).toBeGreaterThan(0);

  const settleVisual = await readSettleVisualState(page);
  expect(settleVisual.count).toBeGreaterThan(0);
  expect(settleVisual.headerKeys).toEqual(["timestamp"]);
  expect(settleVisual.columnKeys.every((key) => key === "timestamp")).toBe(true);
  expect(
    settleVisual.styles.every(
      (style) =>
        style.animationName.includes("dataTableColumnSettle") &&
        style.animationDuration !== "0s" &&
        style.boxShadow !== "none",
    ),
  ).toBe(true);

  await expect
    .poll(async () => {
      const state = await readTableState(page);
      return state.settledCells;
    })
    .toBe(0);

  const visualAfterDrag = await readDragVisualState(page);
  expect(visualAfterDrag.inlineStylesCleared).toBe(true);
});

test("Request Logs: last column does not auto-scroll past the right reorder boundary", async ({
  page,
}) => {
  await setAuthed(page);
  await mockRequestLogsApis(page);

  await page.goto("/manage/#/monitor/request-logs");
  await page.locator('th[data-vt-column-key="model"]').waitFor({ state: "visible" });

  const nearRight = await scrollTableNearRightEdge(page);
  expect(nearRight.maxScrollLeft).toBeGreaterThan(160);
  expect(nearRight.scrollLeft).toBeLessThan(nearRight.maxScrollLeft);

  const dragStart = await page
    .locator('th[data-vt-column-key="model"] [data-vt-column-reorder-handle]')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  const scrollerRight = await page.locator(".table-scrollbar").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.right;
  });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.waitForTimeout(130);
  await page.mouse.move(scrollerRight - 8, dragStart.y, { steps: 8 });
  await page.waitForTimeout(420);

  const during = await readTableState(page);
  expect(during.draggingCells).toBeGreaterThan(0);
  expect(during.scrollLeft).toBeLessThanOrEqual(nearRight.scrollLeft + 2);

  await page.mouse.up();

  const after = await readTableState(page);
  expect(after.draggingCells).toBe(0);
  expect(after.order.at(-1)).toBe("model");
});

test("Request Logs: first column drag keeps a straight left edge", async ({ page }) => {
  await setAuthed(page);
  await mockRequestLogsApis(page);

  await page.goto("/manage/#/monitor/request-logs");
  await page.locator('th[data-vt-column-key="id"]').waitFor({ state: "visible" });

  const dragStart = await page
    .locator('th[data-vt-column-key="id"] [data-vt-column-reorder-handle]')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.waitForTimeout(130);
  await page.mouse.move(dragStart.x + 260, dragStart.y, { steps: 10 });
  await page.waitForTimeout(120);

  const visualDuringDrag = await readDragVisualState(page);
  expect(visualDuringDrag.dragging.length).toBeGreaterThan(0);
  expect(
    visualDuringDrag.dragging.every(
      (style) => style.borderTopLeftRadius === "0px" && style.borderBottomLeftRadius === "0px",
    ),
  ).toBe(true);

  await page.mouse.up();
});

test("Request Logs: last column drag keeps a straight right edge", async ({ page }) => {
  await setAuthed(page);
  await mockRequestLogsApis(page);

  await page.goto("/manage/#/monitor/request-logs");
  await page.locator('th[data-vt-column-key="model"]').waitFor({ state: "visible" });
  await scrollTableNearRightEdge(page);

  const dragStart = await page
    .locator('th[data-vt-column-key="model"] [data-vt-column-reorder-handle]')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.waitForTimeout(130);
  await page.mouse.move(dragStart.x - 260, dragStart.y, { steps: 10 });
  await page.waitForTimeout(120);

  const visualDuringDrag = await readDragVisualState(page);
  expect(visualDuringDrag.dragging.length).toBeGreaterThan(0);
  expect(
    visualDuringDrag.dragging.every(
      (style) => style.borderTopRightRadius === "0px" && style.borderBottomRightRadius === "0px",
    ),
  ).toBe(true);

  await page.mouse.up();
});
