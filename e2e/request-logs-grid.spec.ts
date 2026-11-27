import { expect, test, type Page } from "@playwright/test";

/**
 * 请求日志页（计划 104 第二阶段）在真实浏览器里的交互：
 * - 分面筛选的浮层走 portal，不被滚动区的渐隐遮罩裁掉；
 * - 拖宽：只按下不拖不写偏好，拖过头停在最小宽度，双击恢复默认；
 * - 换列：拖表头换位置，冻结的时间列不动，拖到一半按 Esc 放回原处；
 * - Agent 列：显示名 + 版本、悬停看原始 User-Agent，没有客户端名写「未知」；旧后端整列去掉；
 * - 展开一行看完整详情。
 * 管理端接口全部用 page.route 假数据，契约同 kittors/CliRelay#1311（已上线 dev-6322d74）。
 */

// 请求日志的偏好 id 带版本（REQUEST_LOG_GRID_IDS），旧表格的键不再迁移。
const PREFS_KEY = "cp-grid:request-logs.v2:v1";

type Row = Record<string, unknown>;

function logRows(withClients: boolean): Row[] {
  const clients = [
    ["claude-code", "2.1.3", "claude-cli/2.1.3 (external, cli)"],
    ["codex-desktop", "0.62.0", "codex_desktop/0.62.0 (Mac OS 15.1.1; arm64)"],
    ["", "", ""],
  ] as const;
  return Array.from({ length: 30 }, (_, index) => {
    const [clientName, clientVersion, userAgent] = clients[index % clients.length];
    return {
      id: 3000 + index,
      timestamp: new Date(Date.UTC(2026, 10, 17, 8, 59 - index)).toISOString(),
      api_key: "sk-tes***l-qa",
      api_key_id: `qa-key-${index % 3}`,
      api_key_name: `QA ${index % 3}`,
      model: index % 2 ? "claude-sonnet-5-5" : "gpt-5.1",
      source: "openai",
      channel_name: index % 2 ? "Anthropic main" : "OpenAI fallback",
      provider: index % 2 ? "claude" : "openai",
      auth_type: index % 2 ? "oauth" : "api",
      auth_index: `auth-${index}`,
      failed: index === 4,
      streaming: index % 3 !== 1,
      latency_ms: 900 + index * 410,
      first_token_ms: 120 + index * 30,
      input_tokens: 12_000 + index * 991,
      output_tokens: 300 + index * 17,
      reasoning_tokens: 0,
      cached_tokens: index * 400,
      cache_read_tokens: index * 400,
      cache_write_tokens: 0,
      prompt_tokens: 12_000 + index * 991,
      total_tokens: 12_300 + index * 1008,
      cost: 0.012 + index * 0.001,
      has_content: true,
      ...(withClients
        ? { client_name: clientName, client_version: clientVersion, user_agent: userAgent }
        : {}),
    };
  });
}

async function openRequestLogs(page: Page, options: { withClients?: boolean } = {}) {
  const withClients = options.withClients ?? true;
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
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/usage/logs")) {
      const items = logRows(withClients);
      return json({
        items,
        total: items.length,
        page: 1,
        size: 50,
        capabilities: {
          "api-key-id-filters": true,
          "loop-guard": true,
          ...(withClients ? { "request-log-clients": true } : {}),
        },
        filters: {
          api_key_ids: ["qa-key-0", "qa-key-1", "qa-key-2"],
          api_key_id_names: { "qa-key-0": "QA 0", "qa-key-1": "QA 1", "qa-key-2": "QA 2" },
          api_key_id_counts: { "qa-key-0": 10, "qa-key-1": 10, "qa-key-2": 10 },
          models: ["gpt-5.1", "claude-sonnet-5-5"],
          channels: ["OpenAI fallback", "Anthropic main"],
          statuses: ["success", "failed"],
          guard_kinds: [],
          ...(withClients
            ? {
                client_names: ["claude-code", "codex-desktop", "__unknown__"],
                client_name_counts: { "claude-code": 10, "codex-desktop": 10, __unknown__: 10 },
              }
            : {}),
        },
        stats: { total: items.length, success_rate: 96.7, total_tokens: 900_000, total_cost: 1.2 },
      });
    }
    if (url.pathname.endsWith("/config")) return json({ config: {} });
    return json({ items: [] });
  });
  await page.goto("/#/runtime/request-logs");
  await expect(page.locator("tr[data-row-key]").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
}

const headerBox = (page: Page, columnId: string) =>
  page.locator(`.sn-tbl-wrap thead th[data-col="${columnId}"]`).boundingBox();

const headerOrder = (page: Page) =>
  page.locator(".sn-tbl-wrap thead th[data-col]").evaluateAll((cells) =>
    cells.map((cell) => cell.getAttribute("data-col")),
  );

test.describe("request logs grid", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 800 });
  });

  test("分面筛选的浮层挂在 body 上、整个落在窗口里", async ({ page }) => {
    await openRequestLogs(page);
    await page.getByRole("search").getByRole("button", { name: /^模型/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
    // 浮层不在表格、也不在带渐隐遮罩的滚动区里，不会被裁掉一截。
    expect(await dialog.evaluate((node) => Boolean(node.closest(".sn-tbl-wrap, [data-scroll-fade-host]")))).toBe(false);
  });

  test("拖宽：只按下不拖不写偏好，拖过头停在最小宽度，双击恢复默认", async ({ page }) => {
    await openRequestLogs(page);
    const handle = page.getByRole("separator", { name: "调整「模型」列宽" });
    const before = await headerBox(page, "model");
    const box = await handle.boundingBox();
    if (!before || !box) throw new Error("missing model header");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    expect((await headerBox(page, "model"))?.width).toBeCloseTo(before.width, 0);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").widths, PREFS_KEY)).toBeUndefined();

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 600, y, { steps: 12 });
    await page.mouse.up();
    const narrowed = await headerBox(page, "model");
    // 模型列最小 168 设计像素：存下的就是下限。表格这时放得下、有剩余宽度，模型列是 grow 列会再分到一点，
    // 所以显示宽度不小于下限（0.9 的根字号）即可。
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").widths?.model, PREFS_KEY)).toBe(168);
    expect(narrowed?.width ?? 0).toBeGreaterThanOrEqual(168 * 0.9 - 0.5);
    expect(narrowed?.width ?? 0).toBeLessThan(before.width);

    await handle.dblclick();
    await expect.poll(async () => (await headerBox(page, "model"))?.width ?? 0).toBeGreaterThan(narrowed?.width ?? 0);
  });

  test("换列：拖表头换位置、冻结的时间列不动，拖到一半按 Esc 放回原处", async ({ page }) => {
    await openRequestLogs(page);
    const initial = await headerOrder(page);
    expect(initial[0]).toBe("time");
    const input = await headerBox(page, "tokens");
    const model = await headerBox(page, "model");
    if (!input || !model) throw new Error("missing headers");

    // Esc 放弃：顺序不变
    await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2);
    await page.mouse.down();
    await page.mouse.move(model.x + 10, model.y + model.height / 2, { steps: 10 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await headerOrder(page)).toEqual(initial);

    // 真拖过去：Token 列落到模型列前面，时间列仍在最前
    await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2);
    await page.mouse.down();
    await page.mouse.move(model.x + 10, model.y + model.height / 2, { steps: 10 });
    await page.mouse.up();
    const after = await headerOrder(page);
    expect(after[0]).toBe("time");
    expect(after.indexOf("tokens")).toBeLessThan(after.indexOf("model"));
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").order, PREFS_KEY);
    expect(stored.indexOf("tokens")).toBeLessThan(stored.indexOf("model"));
  });

  test("Agent 列：显示名与版本，悬停看原始 User-Agent，没有客户端名写「未知」", async ({ page }) => {
    await openRequestLogs(page);
    await expect(page.getByRole("columnheader", { name: "Agent" })).toBeVisible();
    const first = page.locator('tr[data-row-key="3000"] td[data-col="agent"]');
    await expect(first).toContainText("Claude Code");
    await expect(first).toContainText("2.1.3");
    await first.getByText("Claude Code").hover();
    await expect(page.getByText("claude-cli/2.1.3 (external, cli)")).toBeVisible();
    await expect(page.locator('tr[data-row-key="3002"] td[data-col="agent"]')).toContainText("未知");
  });

  test("旧后端没有调用方字段：Agent 列与它的筛选都不出现", async ({ page }) => {
    await openRequestLogs(page, { withClients: false });
    await expect(page.locator('.sn-tbl-wrap thead th[data-col="agent"]')).toHaveCount(0);
    await expect(page.getByRole("search").getByRole("button", { name: /^Agent/ })).toHaveCount(0);
  });

  test("展开一行看完整详情，包括原始 User-Agent", async ({ page }) => {
    await openRequestLogs(page);
    await page.getByRole("button", { name: "展开详情" }).first().click();
    const detail = page.locator("[data-grid-detail]").first();
    await expect(detail).toContainText("#3000");
    await expect(detail).toContainText("claude-cli/2.1.3 (external, cli)");
  });
});
