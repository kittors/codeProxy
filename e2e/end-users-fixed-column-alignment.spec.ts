import { expect, test, type Page } from "@playwright/test";

/**
 * 固定列必须和它在 DOM 上的真实边缘重合，表头和单元格在同一条竖线上开始遮挡。
 *
 * 面板整体缩放靠的是根字号（`--ui-scale`，再叠加用户自己调过的浏览器默认字号），列宽跟着变。
 * 旧表格另画一层按算出来的列宽绝对定位的「冻结轨道」，按 16px 硬算过一版：轨道比真实列宽多出
 * 一截，同一列的表头和单元格在差开的两个位置被截断。DataGrid 的冻结列就是 sticky 单元格、阴影是
 * 冻结格边上的伪元素，没有轨道；这里逐档根字号验证的是同一组不变量：表头与单元格同一条边、
 * 固定列贴住视口右缘、阴影贴着固定列外侧、横向滚动条不压在行上。
 */

/** Satin 原生固定列边缘采用 1px 细线 + 柔雾投影，不遮挡左邻列文字。 */
const PIN_EDGE_WIDTH = "1px";

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.end-users");
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v3.end-users");
    localStorage.removeItem("cp-grid:end-users:v1");
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

/** 旧表格存下的列宽（实际像素）：第一次打开时迁成 DataGrid 的设计像素。 */
const setStoredColumnWidths = async (page: Page, widths: Record<string, number>) => {
  await page.addInitScript((stored: Record<string, number>) => {
    localStorage.removeItem("cp-grid:end-users:v1");
    localStorage.setItem("codeProxy.dataTable.columnWidths.v3.end-users", JSON.stringify(stored));
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
  viewportRight: number;
  viewportBottom: number;
  barBottom: number | null;
  actionsCellLeft: number;
  actionsCellRight: number;
  actionsHeaderLeft: number;
  actionsHeaderRight: number;
  cellEdge: boolean;
  headerEdge: boolean;
  shadowLeft: string;
  shadowWidth: string;
  shadowBox: string;
};

/** 把表格横向滚到给定位置后读一组几何值。 */
const readGeometryAtScroll = async (page: Page, ratios: number[]) =>
  page.evaluate(async (scrollRatios: number[]) => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    if (!viewport) throw new Error("Missing end-users table viewport");

    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    const states = [];

    for (const ratio of scrollRatios) {
      viewport.scrollLeft = Math.round(maxScrollLeft * ratio);
      viewport.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const actionsCell = document.querySelector<HTMLElement>('td[data-col="actions"]');
      const actionsHeader = document.querySelector<HTMLElement>('th[data-col="actions"]');
      if (!actionsCell || !actionsHeader) throw new Error("Missing fixed-column geometry");

      const actionsCellRect = actionsCell.getBoundingClientRect();
      const actionsHeaderRect = actionsHeader.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const barX = document.querySelector<HTMLElement>(".sn-tbl-wrap > .sn-sa > .sn-sa-bar.sn-x:not([hidden])");
      const shadow = getComputedStyle(actionsCell, "::before");

      states.push({
        scrollLeft: viewport.scrollLeft,
        maxScrollLeft,
        rootFontSizePx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        viewportRight: viewportRect.left + viewport.clientWidth,
        viewportBottom: viewportRect.bottom,
        barBottom: barX ? barX.getBoundingClientRect().bottom : null,
        actionsCellLeft: actionsCellRect.left,
        actionsCellRight: actionsCellRect.right,
        actionsHeaderLeft: actionsHeaderRect.left,
        actionsHeaderRight: actionsHeaderRect.right,
        cellEdge: actionsCell.classList.contains("sn-pin-r-start"),
        headerEdge: actionsHeader.classList.contains("sn-pin-r-start"),
        shadowLeft: shadow.left,
        shadowWidth: shadow.width,
        shadowBox: shadow.boxShadow,
      });
    }

    return states;
  }, ratios);

const expectFixedColumnHugsItsEdges = (state: FixedColumnGeometry) => {
  // 固定列贴住视口右缘：早一点就漏出下层内容，晚一点会被裁掉。
  expect(state.actionsCellRight).toBeGreaterThanOrEqual(state.viewportRight - 1);
  expect(state.actionsCellRight).toBeLessThanOrEqual(state.viewportRight + 1);
  expect(state.actionsHeaderRight).toBeGreaterThanOrEqual(state.viewportRight - 1);
  expect(state.actionsHeaderRight).toBeLessThanOrEqual(state.viewportRight + 1);

  // 表头和单元格必须在同一条竖线上开始遮挡，否则同一列会在两个位置被截断。
  expect(state.actionsHeaderLeft).toBeGreaterThanOrEqual(state.actionsCellLeft - 1);
  expect(state.actionsHeaderLeft).toBeLessThanOrEqual(state.actionsCellLeft + 1);

  // Satin 1px 细线 + 柔雾投影挂在固定列左缘，既不留白缝也不覆盖邻列文字。
  expect(state.cellEdge).toBe(true);
  expect(state.headerEdge).toBe(true);
  expect(state.shadowLeft).toBe("0px");
  expect(state.shadowWidth).toBe(PIN_EDGE_WIDTH);
  expect(state.shadowBox).not.toBe("none");

  // Satin 悬浮细横向滚动条贴着视口底缘。
  expect(state.barBottom).not.toBeNull();
  expect(Math.abs((state.barBottom ?? 0) - state.viewportBottom)).toBeLessThanOrEqual(6);
};

const openEndUsers = async (page: Page) => {
  await page.goto("/#/access/end-users");
  await page.locator('td[data-col="actions"]').first().waitFor({ state: "visible" });
};

for (const { label, scale, expectedRootFontSizePx } of [
  { label: "the shipped 0.9 UI scale", scale: 0.9, expectedRootFontSizePx: 14.4 },
  { label: "an unscaled 1.0 UI", scale: 1, expectedRootFontSizePx: 16 },
  { label: "an enlarged 1.25 UI scale", scale: 1.25, expectedRootFontSizePx: 20 },
]) {
  test(`End Users: the fixed action column hugs its edges under ${label}`, async ({ page }) => {
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
      expectFixedColumnHugsItsEdges(state);
    }
  });
}

test("End Users: the fixed action column stays put next to a resized neighbour", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await setStoredColumnWidths(page, { account: 320, quota: 360 });
  await mockEndUsersApis(page);

  await openEndUsers(page);

  const states = await readGeometryAtScroll(page, [0, 1]);

  // 迁移过来的列宽生效了（旧键已删、新偏好里有它们），固定列照样贴边。
  const stored = await page.evaluate(() => ({
    legacy: localStorage.getItem("codeProxy.dataTable.columnWidths.v3.end-users"),
    prefs: JSON.parse(localStorage.getItem("cp-grid:end-users:v1") ?? "{}") as {
      widths?: Record<string, number>;
    },
  }));
  expect(stored.legacy).toBeNull();
  expect(stored.prefs.widths?.account).toBeGreaterThan(0);
  expect(stored.prefs.widths?.quota).toBeGreaterThan(0);

  for (const state of states) {
    expectFixedColumnHugsItsEdges(state);
  }
});

test("End Users: the column left of the fixed column is only covered by the fixed column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await mockEndUsersApis(page);

  await openEndUsers(page);

  // 固定列盖住的第一个像素必须已经属于固定列。旧表格的轨道比固定列宽出一截，
  // 这里打到的是左邻列——正是线上看到的「总配额」被切掉一半。
  const hits = await page.evaluate(() => {
    const actionsCell = document.querySelector<HTMLElement>('td[data-col="actions"]');
    const actionsHeader = document.querySelector<HTMLElement>('th[data-col="actions"]');
    if (!actionsCell || !actionsHeader) throw new Error("Missing fixed-column geometry");

    const cellRect = actionsCell.getBoundingClientRect();
    const headerRect = actionsHeader.getBoundingClientRect();
    const probeX = cellRect.left + 2;
    const columnAt = (x: number, y: number) =>
      document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-col]")?.dataset.col ?? null;

    return {
      headerColumnAtEdge: columnAt(probeX, headerRect.top + headerRect.height / 2),
      cellColumnAtEdge: columnAt(probeX, cellRect.top + cellRect.height / 2),
      leftNeighbourAtEdge: columnAt(cellRect.left - 2, cellRect.top + cellRect.height / 2),
    };
  });

  expect(hits.headerColumnAtEdge).toBe("actions");
  expect(hits.cellColumnAtEdge).toBe("actions");
  expect(hits.leftNeighbourAtEdge).not.toBe("actions");
});
