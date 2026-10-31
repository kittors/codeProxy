import { expect, test, type Page } from "@playwright/test";

/**
 * 渠道分组页的「模拟请求」：弹窗在常见的笔记本窗口里不能横向溢出，结果表格放得下五列，
 * 长账号名和长 ID 截断而不是把表格撑宽。接口全部 mock，不需要后端。
 */

const KEYS = [
  { id: "key-team", key: "sk-team", name: "团队 Key", "allowed-channel-groups": ["team"] },
  { id: "key-solo", key: "sk-solo", name: "个人 Key" },
];

const credential = (authID: string, extra: Record<string, unknown> = {}) => ({
  "auth-id": authID,
  provider: "codex",
  weight: 1,
  "in-flight": 0,
  "load-ratio": 0,
  ...extra,
});

const simulation = () => ({
  "api-key": { id: "key-team", name: "团队 Key" },
  endpoint: "chat-completions",
  "requested-model": "gpt-5",
  "route-path": "/team",
  stages: [
    { name: "auth", outcome: "passed" },
    { name: "route", outcome: "passed" },
    { name: "channel-group", outcome: "passed" },
    { name: "quota", outcome: "skipped" },
    { name: "model-policy", outcome: "passed" },
    { name: "model-gate", outcome: "passed" },
    { name: "ccswitch-mapping", outcome: "passed" },
    { name: "system-prompt", outcome: "passed" },
    { name: "handler", outcome: "passed" },
  ],
  route: { "route-path": "/team", group: "team", fallback: "default" },
  model: "gpt-5",
  selection: {
    model: "gpt-5",
    "model-key": "gpt-5",
    providers: ["codex"],
    groups: [
      {
        name: "team",
        distribution: "least-load",
        sticky: true,
        credentials: [
          credential("codex-team-a.json", {
            label: "team-a@example.com",
            attempt: 1,
            weight: 3,
            "in-flight": 2,
            "concurrency-limit": 8,
            "load-ratio": 0.31,
            score: 0.42,
          }),
          credential("codex-team-b.json", {
            label: "team-b@example.com",
            attempt: 2,
            "load-ratio": 0.6,
            score: 0.9,
          }),
          credential("codex-a-very-long-credential-file-name-for-a-shared-account-0001.json", {
            label:
              "a-very-long-mailbox-name-for-an-account-shared-by-the-platform@example-enterprise.com",
            shared: true,
            blocked: "cooldown",
            "blocked-until": new Date(Date.now() + 25 * 60_000).toISOString(),
            "block-cause": "rate_limited",
            "block-http-status": 429,
          }),
          credential("codex-team-d.json", {
            label: "team-d@example.com",
            excluded: "model",
            "model-excluded-by": ["team", "pro"],
          }),
          credential("codex-team-e.json", { label: "team-e@example.com", excluded: "channel" }),
        ],
      },
    ],
    attempts: [
      { "auth-id": "codex-team-a.json", group: "team", "upstream-model": "gpt-5" },
      { "auth-id": "codex-team-b.json", group: "team", "upstream-model": "gpt-5" },
    ],
  },
});

const openChannelGroups = async (page: Page) => {
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
    if (path === "/config") return json({ config: {} });
    if (path === "/update/check") return json({ has_update: false });
    if (path === "/routing-config") {
      return json({
        strategy: "round-robin",
        "include-default-group": true,
        "channel-groups": [{ name: "team", match: { channels: ["Team Codex"] } }],
        "path-routes": [{ path: "/team", group: "team" }],
        capabilities: { "routing-simulation": true },
      });
    }
    if (path === "/channel-groups") {
      return json({ items: [{ name: "team", channels: ["Team Codex"] }] });
    }
    if (path === "/api-key-entries") return json({ "api-key-entries": KEYS });
    if (path === "/models") return json({ data: [{ id: "gpt-5" }, { id: "gpt-5-mini" }] });
    if (path === "/routing-simulation") return json(simulation());
    return json({ items: [], files: [], data: [], total: 0, config: {} });
  });

  await page.goto("/#/models/channel-groups");
};

for (const width of [1280, 1470]) {
  test(`the routing simulator fits a ${width}×720 window`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await openChannelGroups(page);

    await page.getByRole("button", { name: "模拟请求" }).click();
    const dialog = page.getByRole("dialog", { name: "模拟一次请求" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox", { name: "API Key" }).click();
    await page
      .getByRole("listbox", { name: "API Key" })
      .getByRole("option", { name: "团队 Key" })
      .click();
    await dialog.getByRole("combobox", { name: "模型" }).click();
    await page
      .getByRole("listbox", { name: "模型" })
      .getByRole("option", { name: "gpt-5", exact: true })
      .click();
    await dialog.getByRole("button", { name: "开始模拟" }).click();

    await expect(dialog.getByText("由 team-a@example.com 处理").first()).toBeVisible();
    await expect(dialog.getByRole("table")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`simulator-${width}.png`) });

    // 弹窗在窗口里，结果表格不比弹窗宽：长账号名截断，不把表格撑出横向滚动。
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const overflow = await dialog.getByRole("table").evaluate((table) => {
      const scroller = table.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);

    // 不参与的账号默认收起，展开后能看到原因。
    await dialog.getByText("不参与的账号（2）").click();
    await expect(dialog.getByText("不在 Key 允许的渠道里")).toBeVisible();
    await dialog.getByText("不参与的账号（2）").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`simulator-${width}-excluded.png`) });
  });
}
