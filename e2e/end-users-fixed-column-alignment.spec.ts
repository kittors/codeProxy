import { expect, test, type Page } from "@playwright/test";

/**
 * 固定列的白色轨道和边缘阴影是按算出来的列宽绝对定位的，必须和固定列在 DOM 上的
 * 真实边缘重合。
 *
 * 面板整体缩放靠的是根字号（`--ui-scale`，再叠加用户自己调过的浏览器默认字号），
 * Tailwind 的 rem 刻度跟着变。按 16px 硬算过一版：轨道比真实列宽多出一截，压到
 * 左邻列上，而表头是 sticky（盖在轨道之上）、数据行是 static（被轨道盖住）——
 * 同一列的表头和单元格于是在差开的两个位置被截断，阴影也落在离固定列边缘还有
 * 一截的地方。所以这里逐档根字号验证几何，而不是只测默认那一档。
 */

const STICKY_EDGE_SHADOW_WIDTH = 28;
/** 横向滚动条占掉的底部高度，轨道要给它让位。 */
const HORIZONTAL_SCROLLBAR_INSET = 14;

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.end-users");
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v2.end-users");
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

const setStoredColumnWidths = async (page: Page, widths: Record<string, number>) => {
  await page.addInitScript((stored: Record<string, number>) => {
    localStorage.setItem("codeProxy.dataTable.columnWidths.v2.end-users", JSON.stringify(stored));
  }, widths);
};

const setRootFontScale = async (page: Page, scale: number) => {
  await page.addInitScript((value: number) => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.setProperty("--ui-scale", String(value));
    });
    document.documentElement.style.setProperty("--ui-scale", String(value));
  }, scale);
};

const mockEndUsersApis = async (page: Page) => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: `end-user-${index}`,
    tenant_id: "tenant-e2e",
    username: `e2e-user-${index}`,
    display_name: `E2E User ${index}`,
    status: "active",
    must_change_password: false,
    last_login_at: "2026-09-12T10:41:47Z",
    created_at: "2026-05-13T15:32:00Z",
    updated_at: "2026-05-13T15:32:00Z",
    version: 1,
    api_key_count: 1,
    "daily-spending-used": 12.34,
    "lifetime-spending-used": 567.89,
    "daily-limit": index % 2 === 0 ? 2000 : undefined,
    "concurrency-limit": 10,
    "rpm-limit": 60,
    "tpm-limit": 100000,
  }));

  await page.route("**/v0/management/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith("/v0/management/end-users")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

type FixedColumnGeometry = {
  scrollLeft: number;
  maxScrollLeft: number;
  rootFontSizePx: number;
  containerRight: number;
  containerBottom: number;
  actionsCellLeft: number;
  actionsCellRight: number;
  actionsCellWidth: number;
  actionsHeaderLeft: number;
  actionsHeaderRight: number;
  endRailLeft: number;
  endRailRight: number;
  endRailBottom: number;
  endBoundaryLeft: number;
  endBoundaryRight: number;
  endBoundaryWidth: number;
};

/** 把表格横向滚到给定位置后读一组几何值。 */
const readGeometryAtScroll = async (page: Page, ratios: number[]) =>
  page.evaluate(async (scrollRatios: number[]) => {
    const scrollContent = document.querySelector<HTMLElement>("[data-vt-scroll-content]");
    const container = scrollContent?.parentElement;
    if (!scrollContent || !container) throw new Error("Missing end-users table viewport");

    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const states = [];

    for (const ratio of scrollRatios) {
      container.scrollLeft = Math.round(maxScrollLeft * ratio);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const actionsCell = document.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
      const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
      const endRail = document.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
      const endBoundary = document.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
      if (!actionsCell || !actionsHeader || !endRail || !endBoundary) {
        throw new Error("Missing fixed-column geometry");
      }

      const actionsCellRect = actionsCell.getBoundingClientRect();
      const actionsHeaderRect = actionsHeader.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const endRailRect = endRail.getBoundingClientRect();
      const endBoundaryRect = endBoundary.getBoundingClientRect();

      states.push({
        scrollLeft: container.scrollLeft,
        maxScrollLeft,
        rootFontSizePx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        containerRight: containerRect.right,
        containerBottom: containerRect.bottom,
        actionsCellLeft: actionsCellRect.left,
        actionsCellRight: actionsCellRect.right,
        actionsCellWidth: actionsCellRect.width,
        actionsHeaderLeft: actionsHeaderRect.left,
        actionsHeaderRight: actionsHeaderRect.right,
        endRailLeft: endRailRect.left,
        endRailRight: endRailRect.right,
        endRailBottom: endRailRect.bottom,
        endBoundaryLeft: endBoundaryRect.left,
        endBoundaryRight: endBoundaryRect.right,
        endBoundaryWidth: endBoundaryRect.width,
      });
    }

    return states;
  }, ratios);

const expectRailHugsFixedColumn = (state: FixedColumnGeometry) => {
  // 轨道左缘就是固定列左缘：早一点就会盖住左邻列，晚一点会漏出下层内容。
  expect(state.endRailLeft).toBeGreaterThanOrEqual(state.actionsCellLeft - 1);
  expect(state.endRailLeft).toBeLessThanOrEqual(state.actionsCellLeft + 1);
  expect(state.endRailRight).toBeGreaterThanOrEqual(state.containerRight - 1);
  expect(state.endRailRight).toBeLessThanOrEqual(state.containerRight + 1);

  // 表头和单元格必须在同一条竖线上开始遮挡，否则同一列会在两个位置被截断。
  expect(state.actionsHeaderLeft).toBeGreaterThanOrEqual(state.actionsCellLeft - 1);
  expect(state.actionsHeaderLeft).toBeLessThanOrEqual(state.actionsCellLeft + 1);

  // 阴影贴着固定列外侧，中间不留白缝。
  expect(state.endBoundaryRight).toBeGreaterThanOrEqual(state.actionsCellLeft - 1);
  expect(state.endBoundaryRight).toBeLessThanOrEqual(state.actionsCellLeft + 1);
  expect(state.endBoundaryWidth).toBeGreaterThanOrEqual(STICKY_EDGE_SHADOW_WIDTH - 1);
  expect(state.endBoundaryWidth).toBeLessThanOrEqual(STICKY_EDGE_SHADOW_WIDTH + 1);

  // 轨道给横向滚动条让位，不盖到容器底边。
  expect(state.endRailBottom).toBeLessThanOrEqual(
    state.containerBottom - HORIZONTAL_SCROLLBAR_INSET + 1,
  );
};

const openEndUsers = async (page: Page) => {
  await page.goto("/#/access/end-users");
  await page.locator('td[data-vt-column-key="actions"]').first().waitFor({ state: "visible" });
};

for (const { label, scale, expectedRootFontSizePx } of [
  { label: "the shipped 0.9 UI scale", scale: 0.9, expectedRootFontSizePx: 14.4 },
  { label: "an unscaled 1.0 UI", scale: 1, expectedRootFontSizePx: 16 },
  { label: "an enlarged 1.25 UI scale", scale: 1.25, expectedRootFontSizePx: 20 },
]) {
  test(`End Users: the fixed action rail hugs its column under ${label}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAuthed(page);
    await setRootFontScale(page, scale);
    await mockEndUsersApis(page);

    await openEndUsers(page);

    const states = await readGeometryAtScroll(page, [0, 0.5, 1]);

    expect(states).toHaveLength(3);
    expect(states[0]?.maxScrollLeft).toBeGreaterThan(0);
    expect(states[0]?.rootFontSizePx).toBeCloseTo(expectedRootFontSizePx, 1);

    for (const state of states) {
      expectRailHugsFixedColumn(state);
    }
  });
}

test("End Users: the fixed action rail follows a resized neighbour", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await setStoredColumnWidths(page, { account: 320, quota: 360 });
  await mockEndUsersApis(page);

  await openEndUsers(page);

  const states = await readGeometryAtScroll(page, [0, 1]);

  for (const state of states) {
    expectRailHugsFixedColumn(state);
  }
});

test("End Users: the column left of the fixed rail is only covered by the fixed column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await mockEndUsersApis(page);

  await openEndUsers(page);

  // 轨道盖住的第一个像素必须已经属于固定列。修复前轨道比固定列宽出一截，
  // 这里打到的是左邻列——正是线上看到的「总配额」被切掉一半。
  const hits = await page.evaluate(() => {
    const actionsCell = document.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
    const actionsHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
    const endRail = document.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
    if (!actionsCell || !actionsHeader || !endRail)
      throw new Error("Missing fixed-column geometry");

    const cellRect = actionsCell.getBoundingClientRect();
    const headerRect = actionsHeader.getBoundingClientRect();
    const railRect = endRail.getBoundingClientRect();
    const probeX = railRect.left + 2;
    const columnAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-vt-column-key]")?.dataset
        .vtColumnKey ?? null;

    return {
      headerColumnAtRailEdge: columnAt(probeX, headerRect.top + headerRect.height / 2),
      cellColumnAtRailEdge: columnAt(probeX, cellRect.top + cellRect.height / 2),
    };
  });

  expect(hits.headerColumnAtRailEdge).toBe("actions");
  expect(hits.cellColumnAtRailEdge).toBe("actions");
});
