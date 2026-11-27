import { expect, test, type Page } from "@playwright/test";

/**
 * AI 账号列表视图的固定「操作」列。
 *
 * 线上看到过的样子：操作列左侧那道阴影从表头一路拖到卡片底部，空白处也有一条灰带；
 * 第一个操作按钮（查看）还被阴影压住。那是旧表格另画一层「冻结轨道」、按视口高度和名义列宽
 * 定位造成的。DataGrid 的冻结列就是 sticky 单元格，阴影是每个冻结格边上的伪元素：
 * 它天然只到最后一行、贴着列的外侧。这里锁住的就是这两条，以及「表格比列宽之和更宽时，
 * 多出来的宽度只给可伸展的列，固定列保持自己的宽度」。
 */

const files = ["ada", "alan", "grace", "katherine", "linus", "margaret"].map((name, i) => ({
  id: `auth-${name}`,
  name: `${name}@example.com.json`,
  label: `${name}@example.com`,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: `idx-${name}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + i,
}));

const openListView = async (page: Page) => {
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
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v3.auth-files");
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.auth-files");
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/auth-files")) return json({ files });
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    if (path.includes("/ai-accounts/status-refresh"))
      return json({ job_id: "j", state: "completed", total: 0, completed: 0, failed: 0, results: [] });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
  await expect(page.locator('th[data-col="actions"]')).toBeVisible();
  await expect(page.locator('td[data-col="actions"]')).toHaveCount(files.length);
};

const readGeometry = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    // 阴影有 180ms 的淡入淡出。
    await new Promise((resolve) => setTimeout(resolve, 260));
    const header = document.querySelector<HTMLElement>('th[data-col="actions"]');
    const cells = [...document.querySelectorAll<HTMLElement>('td[data-col="actions"]')];
    const firstButton = cells[0]?.querySelector("button");
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    if (!header || !firstButton || !viewport) throw new Error("missing fixed actions column");
    const headerRect = header.getBoundingClientRect();
    const firstCellRect = cells[0]!.getBoundingClientRect();
    const shadow = getComputedStyle(cells[0]!, "::before");
    const lastRowBottom = cells[cells.length - 1]!.getBoundingClientRect().bottom;
    // 带边缘阴影的格子：每一行的操作格加表头，不多也不少（没有一条按视口高度画的轨道）。
    const edges = [...document.querySelectorAll<HTMLElement>(".sn-tbl-wrap .sn-pin-r-start")];
    return {
      header: { left: headerRect.left, right: headerRect.right, width: headerRect.width },
      firstCell: { left: firstCellRect.left, width: firstCellRect.width },
      viewportRight: viewport.getBoundingClientRect().left + viewport.clientWidth,
      shadowOpacity: Number(shadow.opacity),
      shadowLeft: shadow.left,
      shadowWidth: shadow.width,
      shadowBox: shadow.boxShadow,
      edgeCount: edges.length,
      lowestEdgeBottom: Math.max(...edges.map((edge) => edge.getBoundingClientRect().bottom)),
      lastRowBottom,
      firstButtonLeft: firstButton.getBoundingClientRect().left,
    };
  });

const expectShadowHugsTheFixedColumn = (geometry: Awaited<ReturnType<typeof readGeometry>>) => {
  // The fixed column sits at the right edge, header and cells on one line…
  expect(Math.abs(geometry.header.right - geometry.viewportRight)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.firstCell.left - geometry.header.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.firstCell.width - geometry.header.width)).toBeLessThanOrEqual(1);
  // Satin 原生 1px 细线 + 柔雾 box-shadow 离边投影，不覆盖相邻列也不压住操作按钮。
  expect(geometry.shadowLeft).toBe("0px");
  expect(geometry.shadowWidth).toBe("1px");
  expect(geometry.shadowBox).not.toBe("none");
  expect(geometry.firstButtonLeft).toBeGreaterThan(geometry.firstCell.left);
  // …and it belongs to the rows themselves, so it stops at the last row.
  expect(geometry.edgeCount).toBe(files.length + 1);
  expect(geometry.lowestEdgeBottom).toBeLessThanOrEqual(geometry.lastRowBottom + 1);
};

test("AI accounts: the fixed actions column's shadow hugs the column and stops at the last row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openListView(page);

  const geometry = await readGeometry(page);
  // Columns overflow at this width, so the shadow is showing.
  expect(geometry.shadowOpacity).toBe(1);
  expectShadowHugsTheFixedColumn(geometry);
});

test("AI accounts: a table wider than its columns leaves the fixed column at its width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openListView(page);

  // When the table is wider than the sum of its columns, the spare width goes to the columns that
  // stretch; the fixed column keeps its width (a drag would otherwise store a stretched width),
  // and its edge still hugs it.
  const nominalWidth = (await readGeometry(page)).header.width;
  await page.setViewportSize({ width: 2560, height: 900 });
  const widened = await readGeometry(page);
  expect(
    await page.evaluate(() => document.querySelector(".sn-tbl-wrap")?.getAttribute("data-x-overflow")),
  ).toBe("false");
  expect(Math.abs(widened.header.width - nominalWidth)).toBeLessThanOrEqual(1);
  expectShadowHugsTheFixedColumn(widened);
  // Nothing scrolls under it any more, so there is no shadow to show.
  expect(widened.shadowOpacity).toBe(0);
});
