import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 控件表面状态回归：禁用态必须仍有可见填充，鼠标点击不得把触发器刷成白底加描边。
 *
 * 两个问题都出在共享的 controlSurface / selectTriggerDisabled 上，所以只要选一个
 * 同时挂着「禁用 Select」和「可交互 Select」的页面即可覆盖全部下拉控件。
 */

const observedAt = new Date().toISOString();

// 3 个同状态（全部启用）的账号：让「状态」筛选只剩一个选项，从而触发 Select 的禁用态。
const authFiles = ["alias-a", "alias-b", "alias-c"].map((idx, i) => ({
  id: `auth-${idx}`,
  name: `account-${i}@example.com.json`,
  label: `account-${i}@example.com`,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: idx,
  auth_subject_id: `sub-${idx}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + i,
}));

const statusItems = authFiles.map((f) => ({
  auth_index: f.auth_index,
  auth_subject_id: f.auth_subject_id,
  provider: "codex",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 1,
  refresh_state: "success",
  health_status: "ok",
  plan_type: "pro_20x",
  subscription_expires_at: "2026-08-27T00:00:00Z",
  subscription_source: "signed_claims",
  quotas: [
    {
      quota_key: "code_week",
      quota_label: "m_quota.code_weekly",
      percent: 12,
      reset_at: "2026-08-09T06:38:11Z",
      window_seconds: 604800,
      observed_at: observedAt,
    },
  ],
  usage: {
    request_total: 30568,
    success_total: 30507,
    failure_total: 61,
    success_rate: 0.998,
    cycle_request_total: 30568,
    cycle_total_tokens: 3_900_000_000,
    cycle_known: true,
    updated_at: observedAt,
  },
  version: 4,
  upstream_checked_at: observedAt,
  quota_observed_at: observedAt,
  updated_at: observedAt,
}));

const openPage = async (page: Page) => {
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
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/ai-accounts/status")) return json({ items: statusItems });
    if (path.includes("/ai-accounts/status-refresh")) {
      return json({
        job_id: "j",
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      });
    }
    if (path.endsWith("/auth-files")) return json({ files: authFiles });
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/usage/auth-file-trend")) return json({ points: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
  await expect(page.getByTestId("auth-files-cards")).toBeVisible();
};

/**
 * Tailwind v4 输出的是 `oklab(...)`，直接正则取数会拿到 0-1 的分量而不是 sRGB 通道。
 * 借页面内的 canvas 走一遍浏览器自己的颜色解析，再把控件底色合成到白色面板上——
 * 这里要判的本来就是「叠在白卡片上还看不看得见」，所以必须比较合成后的结果。
 */
const compositedOnWhite = async (locator: Locator): Promise<[number, number, number]> =>
  locator.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.globalAlpha = Number(getComputedStyle(el).opacity);
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  });

test.describe("下拉控件表面状态", () => {
  test("禁用的 Select 仍保留可见填充，不会退化成白底", async ({ page }) => {
    await openPage(page);

    const statusSelect = page.getByRole("combobox", { name: "状态" });
    await expect(statusSelect).toBeDisabled();
    const disabledFill = await compositedOnWhite(statusSelect);

    const enabledFill = await compositedOnWhite(page.getByRole("combobox", { name: "自动刷新" }));
    const mean = (fill: [number, number, number]) => (fill[0] + fill[1] + fill[2]) / 3;

    // 禁用态叠在白面板上必须仍然可辨（旧实现是 bg-white/70 + opacity-70，合成后就是纯白，控件消失）。
    expect(mean(disabledFill)).toBeLessThan(252);
    // 而且不该比可用态更浅——否则「不可用」读起来反而像「这里是空的」。
    expect(mean(disabledFill)).toBeLessThanOrEqual(mean(enabledFill) + 1);
  });

  test("鼠标点击 Select 不会把触发器刷成白底加描边", async ({ page }) => {
    await openPage(page);

    const refreshSelect = page.getByRole("combobox", { name: "自动刷新" });
    const idleFill = await compositedOnWhite(refreshSelect);

    await refreshSelect.click();
    await expect(page.getByRole("listbox", { name: "自动刷新" })).toBeVisible();

    // 展开态只允许比静止态更深（hover/open 同色），一旦变亮就是用户看到的「闪一下白」。
    const openFill = await compositedOnWhite(refreshSelect);
    expect(Math.max(...openFill)).toBeLessThanOrEqual(Math.max(...idleFill));

    // 焦点仍在按钮上，但鼠标交互不该留下描边环。
    const shadow = await refreshSelect.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toMatch(/0px 0px 0px [1-9]/);

    await page.keyboard.press("Escape");
    const closedFill = await compositedOnWhite(refreshSelect);
    expect(Math.max(...closedFill)).toBeLessThanOrEqual(Math.max(...idleFill));
  });
});
