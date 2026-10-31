import { expect, test, type Page } from "@playwright/test";

/**
 * 请求详情的「路由时间线」和监控页的「在途请求」：常见笔记本窗口里不横向溢出，长账号名、长错误
 * 原文折行或截断，而不是把弹窗和表格撑宽。接口全部 mock，不需要后端。
 */

const at = (offsetMs: number) =>
  new Date(Date.parse("2026-11-01T05:10:00+08:00") + offsetMs).toISOString();

const routeTrace = {
  steps: [
    {
      kind: "attempt",
      at: at(0),
      duration_ms: 1200,
      attempt: 1,
      group: "team",
      auth_id: "codex-a-very-long-credential-file-name-for-a-shared-account-0001.json",
      auth_label:
        "a-very-long-mailbox-name-for-an-account-shared-by-the-platform@example-enterprise.com",
      provider: "codex",
      model: "gpt-5-codex",
      outcome: "failed",
      status: 429,
      cause: "rate_limited",
      error:
        'rate_limit: {"error":{"type":"usage_limit_reached","message":"The usage limit has been reached for this organization on requests per minute (RPM): Limit 500, Used 500, Requested 1. Please try again in 1.2s."}}',
      blocked: "cooldown",
      blocked_until: at(301_200),
    },
    {
      kind: "skip",
      at: at(1_210),
      reason: "saturated",
      auth_id: "codex-team-b.json",
      auth_label: "team-b@example.com",
      provider: "codex",
    },
    {
      kind: "queue",
      at: at(1_220),
      duration_ms: 2_350,
      accounts: 1,
      outcome: "success",
      auth_id: "codex-team-b.json",
      auth_label: "team-b@example.com",
    },
    {
      kind: "attempt",
      at: at(3_580),
      duration_ms: 18_400,
      attempt: 2,
      group: "team",
      auth_id: "codex-team-b.json",
      auth_label: "team-b@example.com",
      provider: "codex",
      model: "gpt-5-codex",
      outcome: "success",
      first_token_ms: 850,
    },
  ],
};

const inFlight = {
  requests: [
    {
      request_id: "req-stream",
      method: "POST",
      path: "/v1/messages",
      started_at: new Date(Date.now() - 95_000).toISOString(),
      elapsed_ms: 95_000,
      stage: "streaming",
      stage_elapsed_ms: 90_000,
      model: "claude-sonnet-5-5",
      stream: true,
      attempt: 1,
      account: {
        auth_id: "claude-a.json",
        label:
          "a-very-long-mailbox-name-for-an-account-shared-by-the-platform@example-enterprise.com",
        provider: "claude",
        group: "team",
      },
      api_key_id: "key-team",
      api_key_name: "团队 Key",
    },
    {
      request_id: "req-queued",
      method: "POST",
      path: "/v1/chat/completions",
      started_at: new Date(Date.now() - 21_000).toISOString(),
      elapsed_ms: 21_000,
      stage: "queued",
      stage_elapsed_ms: 19_000,
      model: "gpt-5",
      stream: false,
      attempt: 1,
      account: { auth_id: "codex-team-b.json", label: "team-b@example.com", provider: "codex" },
      api_key_id: "key-solo",
      api_key_name: "个人 Key",
    },
    {
      request_id: "req-new",
      method: "POST",
      path: "/v1/responses",
      started_at: new Date(Date.now() - 300).toISOString(),
      elapsed_ms: 300,
      stage: "preparing",
      stage_elapsed_ms: 300,
      model: "gpt-5",
    },
  ],
  total: 3,
  generated_at: new Date().toISOString(),
};

const overview = {
  generated_at: new Date().toISOString(),
  range: { key: "24h", step_seconds: 3600, timezone: "Asia/Shanghai" },
  summary: { current: { requests: 120, success: 118, failed: 2 }, previous: { requests: 100 } },
  capabilities: { "in-flight-requests": true },
};

async function openPanel(page: Page, hash: string) {
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
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });

  await page.route("**/v0/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const path = url.pathname.replace(/^.*\/v0\/management/, "");
    if (path === "/config") return json({});
    if (path === "/update/check") return json({ has_update: false });
    if (path === "/request-log-storage/store-content") return json({ enabled: true });
    if (path === "/usage/logs") {
      return json({
        items: [
          {
            id: 201,
            timestamp: at(0),
            api_key: "sk-tes***7890",
            api_key_name: "团队 Key",
            model: "gpt-5-codex",
            source: "codex",
            channel_name: "team-b@example.com",
            failed: false,
            streaming: true,
            latency_ms: 18_400,
            first_token_ms: 850,
            total_tokens: 46,
            has_content: true,
          },
        ],
        total: 1,
        page: 1,
        size: 50,
        filters: { models: ["gpt-5-codex"], channels: ["team-b@example.com"] },
        stats: { total: 1, success_rate: 100, total_tokens: 46 },
      });
    }
    if (path === "/usage/logs/201/content") {
      const part = url.searchParams.get("part");
      const content =
        part === "details"
          ? {
              client: { ip: "203.0.113.8", method: "POST", path: "/v1/responses" },
              diagnostic: { request_id: "req-201", route_trace: routeTrace },
            }
          : part === "input"
            ? { messages: [{ role: "user", content: "hello" }] }
            : { output: "hi" };
      return json({ id: 201, model: "gpt-5-codex", part, content: JSON.stringify(content) });
    }
    if (path === "/usage/logs/201/egress")
      return json({ using_proxy: false, effective_ip: "198.51.100.7" });
    if (path === "/usage/monitor/overview") return json(overview);
    if (path === "/usage/monitor/realtime") return json({ points: [] });
    if (path === "/usage/monitor/in-flight") return json(inFlight);
    return json({ items: [], files: [], data: [], total: 0 });
  });

  await page.goto(hash);
}

for (const width of [1280, 1470]) {
  test(`the route timeline fits the request details at ${width}×720`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await openPanel(page, "/#/monitor/request-logs");

    await page.getByTitle("点击查看输出").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "请求详情" }).click();

    const section = dialog.getByTestId("request-detail-section-route");
    await expect(section).toBeVisible();
    await expect(section.getByTestId("route-trace-summary")).toContainText(
      "前 1 次尝试失败，第 2 次由 team-b@example.com 完成。",
    );
    await expect(section.getByRole("listitem")).toHaveCount(4);
    await expect(section.getByText("触发限流（429）")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`route-timeline-${width}.png`) });

    // 长账号名和上游原文在分区里折行，不把弹窗撑出横向滚动。
    const overflow = await section.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });

  test(`the in-flight table fits the monitor page at ${width}×720`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await openPanel(page, "/#/runtime/monitor");

    const card = page
      .getByRole("heading", { name: /^在途请求/ })
      .locator("xpath=ancestor::section[1]");
    await expect(card.getByTestId("in-flight-row")).toHaveCount(3);
    await expect(card.getByText("流式中")).toBeVisible();
    await expect(card.getByTestId("in-flight-row").nth(1)).toHaveAttribute("data-slow", "true");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`in-flight-${width}.png`) });

    // 长账号名截断：表格不比卡片宽。
    const overflow = await card.getByRole("table").evaluate((table) => {
      const scroller = table.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
