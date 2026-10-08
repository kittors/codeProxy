import { expect, test, type Page } from "@playwright/test";

/**
 * 系统设置 → 外观：选风格、调进度条粗细后全站立即生效，刷新后首屏就是选好的样子，恢复默认后
 * 回到多彩。断言落在计算样式上（不是类名）：外观靠 <html> 上的开关和变量切换，类名两套都在，
 * 只有计算样式能说明「现在实际画出来的是哪一套」。
 */

const principal = {
  user_id: "u1",
  username: "admin",
  display_name: "Admin",
  tenant_id: "t1",
  tenant_slug: "system",
  is_super_admin: true,
  platform_admin: true,
  must_change_password: false,
  kind: "user",
  roles: [],
  permissions: ["*"],
  menus: [],
  effective_tenant: { id: "t1", name: "System", slug: "system", type: "system" },
  user: { display_name: "Admin", username: "admin", role_codes: ["platform_super_admin"] },
};

const openAppearance = async (page: Page) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("appearance-e2e-seeded")) return;
    sessionStorage.setItem("appearance-e2e-seeded", "1");
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
    localStorage.setItem("code-proxy-admin-theme", "light");
  });
  await page.route("**/v0/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/auth/me")) return json({ principal });
    if (url.pathname.endsWith("/config")) return json({ config: {} });
    if (url.pathname.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [], files: [], data: [], total: 0 });
  });
  await page.goto("/#/system/appearance");
  await expect(page.getByRole("heading", { name: "外观", level: 2 })).toBeVisible();
};

/** 预览里第一条额度条（86%，健康段）的填充与轨道。 */
const previewBar = (page: Page) =>
  page.evaluate(() => {
    const fill = document.querySelector('aside [data-testid="quota-bar-fill"]') as HTMLElement;
    const track = fill.parentElement as HTMLElement;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      fillImage: getComputedStyle(fill).backgroundImage,
      fillColor: getComputedStyle(fill).backgroundColor,
      trackHeight: track.getBoundingClientRect().height,
      root,
    };
  });

const htmlState = (page: Page) =>
  page.evaluate(() => ({
    palette: document.documentElement.dataset.palette,
    icons: document.documentElement.dataset.icons,
    bars: document.documentElement.dataset.bars,
    accent: document.documentElement.style.getPropertyValue("--cp-pref-accent"),
    bar: document.documentElement.style.getPropertyValue("--cp-pref-bar"),
  }));

test("外观：默认多彩，切到简约与调粗进度条即时生效、刷新保留、恢复默认回到多彩", async ({ page }) => {
  await openAppearance(page);

  // 侧边栏里有外观入口（管理密钥模式下来自前端兜底菜单）。
  await expect(page.getByRole("link", { name: "外观" })).toHaveAttribute("href", /#\/system\/appearance$/);

  expect(await htmlState(page)).toEqual({
    palette: "colorful",
    icons: "colorful",
    bars: "semantic",
    accent: "",
    bar: "",
  });
  // 多彩：健康段是绿色渐变；默认 8px（随根字号缩放）。
  let bar = await previewBar(page);
  expect(bar.fillImage).toContain("linear-gradient");
  expect(bar.trackHeight).toBeCloseTo((8 / 16) * bar.root, 1);

  await page.getByRole("radiogroup", { name: "风格" }).getByRole("radio", { name: /简约/ }).click();
  expect(await htmlState(page)).toMatchObject({ palette: "quiet", icons: "mono", bars: "accent", accent: "#2a6ee8" });
  bar = await previewBar(page);
  expect(bar.fillImage).toBe("none");
  expect(bar.fillColor).toBe("rgb(42, 110, 232)");

  await page.getByRole("slider", { name: "进度条粗细" }).fill("14");
  bar = await previewBar(page);
  expect(bar.trackHeight).toBeCloseTo((14 / 16) * bar.root, 1);

  // 刷新：首屏脚本在应用加载前就写回了开关和变量。
  await page.reload();
  await expect(page.getByRole("heading", { name: "外观", level: 2 })).toBeVisible();
  expect(await htmlState(page)).toMatchObject({ palette: "quiet", bars: "accent", accent: "#2a6ee8", bar: "14" });

  await page.getByRole("button", { name: "恢复默认" }).click();
  expect(await htmlState(page)).toEqual({
    palette: "colorful",
    icons: "colorful",
    bars: "semantic",
    accent: "",
    bar: "",
  });
  bar = await previewBar(page);
  expect(bar.fillImage).toContain("linear-gradient");
});
