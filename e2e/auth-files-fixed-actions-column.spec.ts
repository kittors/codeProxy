import { expect, test, type Page } from "@playwright/test";

/**
 * AI 账号列表视图的固定「操作」列。
 *
 * 线上看到的样子：操作列左侧那道阴影从表头一路拖到卡片底部，空白处也有一条灰带；
 * 第一个操作按钮（查看）还被阴影压住。两个原因叠在一起：
 * - 轨道和阴影按视口高度画，表格只有几行时就悬在最后一行下面；
 * - 表格写死了 min-w-[2420px]，比各列宽度之和大出三分之一，table-fixed 把多出来
 *   的宽度摊给每一列（固定列也变宽），而轨道和阴影还按名义列宽定位，于是阴影画进
 *   了固定列里面。
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
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v2.auth-files");
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
  await expect(page.locator('th[data-vt-column-key="actions"]')).toBeVisible();
  await expect(page.locator('td[data-vt-column-key="actions"]')).toHaveCount(files.length);
};

const readGeometry = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`missing ${selector}`);
      return element.getBoundingClientRect();
    };
    const rows = [...document.querySelectorAll<HTMLElement>('td[data-vt-column-key="actions"]')];
    const firstButton = rows[0]?.querySelector("button");
    if (!firstButton) throw new Error("missing first action button");
    return {
      header: rect('th[data-vt-column-key="actions"]'),
      rail: rect("[data-vt-sticky-end-rail]"),
      boundary: rect("[data-vt-sticky-end-boundary]"),
      boundaryOpacity: Number(
        getComputedStyle(document.querySelector("[data-vt-sticky-end-boundary]")!).opacity,
      ),
      lastRowBottom: rows[rows.length - 1]!.getBoundingClientRect().bottom,
      firstButtonLeft: firstButton.getBoundingClientRect().left,
    };
  });

const expectShadowHugsTheFixedColumn = (geometry: Awaited<ReturnType<typeof readGeometry>>) => {
  // The rail backs exactly the fixed column…
  expect(Math.abs(geometry.rail.left - geometry.header.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.rail.width - geometry.header.width)).toBeLessThanOrEqual(1);
  // …the shadow sits just outside it, never over its first button…
  expect(Math.abs(geometry.boundary.right - geometry.header.left)).toBeLessThanOrEqual(1);
  expect(geometry.firstButtonLeft).toBeGreaterThan(geometry.boundary.right);
  // …and both stop at the last row instead of hanging over the empty card.
  expect(geometry.rail.bottom).toBeLessThanOrEqual(geometry.lastRowBottom + 1);
  expect(geometry.boundary.bottom).toBeLessThanOrEqual(geometry.lastRowBottom + 1);
};

test("AI accounts: the fixed actions column's shadow hugs the column and stops at the last row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openListView(page);

  const geometry = await readGeometry(page);
  // Columns overflow at this width, so the shadow is showing.
  expect(geometry.boundaryOpacity).toBe(1);
  expectShadowHugsTheFixedColumn(geometry);
});

test("AI accounts: the overlays follow the rendered column when the table is stretched", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openListView(page);

  // A table wider than the sum of its columns stretches every column, the fixed
  // one included; the overlays must follow the rendered width, not the nominal one.
  const nominalWidth = (await readGeometry(page)).header.width;
  await page.evaluate(() => {
    const table = document.querySelector<HTMLTableElement>("[data-vt-scroll-content] table");
    if (!table) throw new Error("missing table");
    table.style.minWidth = `${table.getBoundingClientRect().width + 600}px`;
  });

  const stretched = await readGeometry(page);
  expect(stretched.header.width).toBeGreaterThan(nominalWidth + 20);
  expectShadowHugsTheFixedColumn(stretched);
});
