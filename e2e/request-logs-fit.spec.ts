import { expect, test, type Page } from "@playwright/test";

/**
 * 请求日志的默认列在常见笔记本宽度下一屏放下（计划 104 第二阶段验收，11-18）。
 *
 * - 窗口 ≥1440（以及 1366）、侧栏展开：默认列全部进表格框、没有横向滚动；吞吐、费用、Agent、Token（含缓存命中）
 *   都在可视区里，不被右侧冻结的「状态」列压住。表格打开了 fitColumns，用户 / Key、模型、渠道三列会往
 *   各自的最小宽度收。
 * - 旧表格存下的列宽（v3 键，按旧列与旧根字号的实际像素）不能把新默认布局撑宽：请求日志换了偏好 id，
 *   旧键不再迁移。
 * - 更窄的窗口允许横向滚动，但冻结列朝向滚动内容的一侧有阴影：有溢出时右侧冻结列的阴影亮着，
 *   滚开起点后左侧冻结列的阴影亮着。
 */

type Row = Record<string, unknown>;

function logRows(): Row[] {
  const clients = [
    ["claude-code", "2.1.3", "claude-cli/2.1.3 (external, cli)"],
    ["codex-desktop", "0.62.0", "codex_desktop/0.62.0 (Mac OS 15.1.1; arm64)"],
    ["", "", ""],
  ] as const;
  return Array.from({ length: 30 }, (_, index) => {
    const [clientName, clientVersion, userAgent] = clients[index % clients.length];
    return {
      id: 4000 + index,
      timestamp: new Date(Date.UTC(2026, 10, 17, 8, 59 - index)).toISOString(),
      api_key: "sk-tes***l-qa",
      api_key_id: `qa-key-${index % 3}`,
      api_key_name: `QA ${index % 3}`,
      model: index % 2 ? "claude-sonnet-5-5-20261001" : "gpt-5.1-codex-max",
      source: "openai",
      channel_name: index % 2 ? "Anthropic main pool (Tokyo)" : "OpenAI fallback relay",
      provider: index % 2 ? "claude" : "openai",
      auth_type: index % 2 ? "oauth" : "api",
      auth_index: `auth-${index}`,
      failed: index === 4,
      streaming: index % 3 !== 1,
      latency_ms: 900 + index * 4100,
      first_token_ms: 120 + index * 300,
      input_tokens: 120_000 + index * 9_910,
      output_tokens: 3_000 + index * 170,
      reasoning_tokens: 0,
      cached_tokens: index * 4_000,
      cache_read_tokens: index * 4_000,
      cache_write_tokens: 0,
      prompt_tokens: 120_000 + index * 9_910,
      total_tokens: 123_000 + index * 10_080,
      cost: 0.12 + index * 0.01,
      has_content: true,
      client_name: clientName,
      client_version: clientVersion,
      user_agent: userAgent,
    };
  });
}

async function openRequestLogs(page: Page, init?: () => void) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: window.location.origin,
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  if (init) await page.addInitScript(init);
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/usage/logs")) {
      const items = logRows();
      return json({
        items,
        total: items.length,
        page: 1,
        size: 50,
        capabilities: { "api-key-id-filters": true, "loop-guard": true, "request-log-clients": true },
        filters: {
          api_key_ids: ["qa-key-0", "qa-key-1", "qa-key-2"],
          api_key_id_names: { "qa-key-0": "QA 0", "qa-key-1": "QA 1", "qa-key-2": "QA 2" },
          models: ["gpt-5.1-codex-max", "claude-sonnet-5-5-20261001"],
          channels: ["OpenAI fallback relay", "Anthropic main pool (Tokyo)"],
          statuses: ["success", "failed"],
          guard_kinds: [],
          client_names: ["claude-code", "codex-desktop", "__unknown__"],
          client_name_counts: { "claude-code": 10, "codex-desktop": 10, __unknown__: 10 },
        },
        stats: { total: items.length, success_rate: 96.7, total_tokens: 9_000_000, total_cost: 12.5 },
      });
    }
    if (url.pathname.endsWith("/config")) return json({ config: {} });
    return json({ items: [] });
  });
  await page.goto("/#/runtime/request-logs");
  await expect(page.locator("tr[data-row-key]").first()).toBeVisible({ timeout: 15_000 });
  // 等行浮入动画与列宽测量走完。
  await page.waitForTimeout(600);
}

/** 表体视口的横向溢出量，以及几列表头相对视口、右侧冻结区的位置。 */
const measure = (page: Page) =>
  page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(".sn-tbl-sc");
    if (!viewport) throw new Error("grid viewport missing");
    const rect = viewport.getBoundingClientRect();
    const header = (id: string) => document.querySelector(`.sn-tbl-wrap thead th[data-col="${id}"]`)?.getBoundingClientRect() ?? null;
    const status = header("status");
    const columns = Object.fromEntries(
      ["agent", "tokens", "latency", "throughput", "cost"].map((id) => {
        const box = header(id);
        return [
          id,
          box
            ? {
                insideViewport: box.left >= rect.left - 0.5 && box.right <= rect.right + 0.5,
                clearOfPinned: status ? box.right <= status.left + 0.5 : true,
              }
            : null,
        ];
      }),
    );
    return { overflowX: viewport.scrollWidth - viewport.clientWidth, columns };
  });

for (const [width, height] of [
  [1470, 800],
  [1440, 900],
  [1366, 768],
  [1280, 720],
]) {
  test(`${width}×${height}：请求日志默认列一屏放下，吞吐、费用、Agent、Token 都直接可见`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openRequestLogs(page);
    const state = await measure(page);
    expect(state.overflowX).toBeLessThanOrEqual(1);
    for (const [id, column] of Object.entries(state.columns)) {
      expect(column, `${id} 列应在表格里`).not.toBeNull();
      expect(column?.insideViewport, `${id} 列表头整个在可视区里`).toBe(true);
      expect(column?.clearOfPinned, `${id} 列没被右侧冻结列压住`).toBe(true);
    }
    // 没有溢出时右侧冻结列不画阴影（没有东西在它下面）。
    const shadow = await page
      .locator('.sn-tbl-wrap thead th[data-col="status"]')
      .evaluate((node) => getComputedStyle(node, "::before").opacity);
    expect(shadow).toBe("0");
  });
}

test("旧表格存下的列宽不会把新默认布局撑宽", async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 800 });
  await openRequestLogs(page, () => {
    // 旧 DataTable 在 request-logs 这个 id 下存的实际像素列宽与列顺序（14.4px 根字号）。
    localStorage.setItem(
      "codeProxy.dataTable.columnWidths.v3.request-logs",
      JSON.stringify({ model: 540, channel: 420, timestamp: 200 }),
    );
    localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.request-logs",
      JSON.stringify(["status", "cost", "model", "channel"]),
    );
  });
  const state = await measure(page);
  expect(state.overflowX).toBeLessThanOrEqual(1);
  const order = await page
    .locator(".sn-tbl-wrap thead th[data-col]")
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-col")));
  expect(order.slice(0, 4)).toEqual(["time", "identity", "model", "channel"]);
  const stored = await page.evaluate(() => localStorage.getItem("cp-grid:request-logs.v2:v1"));
  expect(stored === null || !JSON.parse(stored).widths).toBe(true);
});

test("1024 窄屏允许横向滚动，冻结列朝向滚动内容的一侧有柔和阴影且不遮挡相邻列文字", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await openRequestLogs(page);
  const viewport = page.locator(".sn-tbl-sc").first();
  expect(await viewport.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(1);
  const pinEdge = (selector: string, pseudo: "::before" | "::after") =>
    page.locator(selector).first().evaluate((node, p) => {
      const style = getComputedStyle(node, p);
      return { opacity: style.opacity, width: style.width, boxShadow: style.boxShadow };
    }, pseudo);

  // 起点：右侧冻结列下面压着内容，1px 细线 + 柔雾投影亮起（无旧版 22px 白色遮罩）；左侧还没滚开，不亮。
  await expect.poll(() => pinEdge('.sn-tbl-wrap thead th[data-col="status"]', "::before")).toMatchObject({
    opacity: "1",
    width: "1px",
  });
  await expect.poll(() => pinEdge('.sn-tbl-wrap tbody td[data-col="status"]', "::before")).toMatchObject({
    opacity: "1",
    width: "1px",
  });
  expect((await pinEdge('.sn-tbl-wrap tbody td[data-col="status"]', "::before")).boxShadow).not.toBe("none");
  await expect.poll(() => pinEdge('.sn-tbl-wrap thead th[data-col="time"]', "::after")).toMatchObject({
    opacity: "0",
  });

  // 滚到中间：两侧都亮。
  await viewport.evaluate((node) => {
    node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => pinEdge('.sn-tbl-wrap thead th[data-col="time"]', "::after")).toMatchObject({
    opacity: "1",
    width: "1px",
  });
  await expect.poll(() => pinEdge('.sn-tbl-wrap thead th[data-col="status"]', "::before")).toMatchObject({
    opacity: "1",
    width: "1px",
  });

  // 滚到底：右侧冻结列下面没有内容了，阴影熄掉。
  await viewport.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    node.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => pinEdge('.sn-tbl-wrap thead th[data-col="status"]', "::before")).toMatchObject({
    opacity: "0",
  });
});
