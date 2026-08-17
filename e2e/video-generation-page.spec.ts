import { expect, test, type Page } from "@playwright/test";

/**
 * Renders the video models page against mocked management APIs.
 *
 * Not marked @critical: the page's behaviour is covered by unit tests, and this
 * spec exists so the layout — highlighted curl block, endpoint switch, spec
 * tables — is exercised in a real browser rather than only in jsdom.
 */

const VIDEO_MODEL = {
  id: "grok-imagine-video-1.5",
  provider: "xai",
  display_name: "Grok Imagine Video",
  description: "Grok Imagine text-to-video and image-to-video generation.",
  supports_image_to_video: true,
  max_duration_seconds: 15,
};

const seedAuth = async (page: Page) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    );
    localStorage.setItem(
      "cli-proxy-language",
      JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }),
    );
  });
};

const mockApis = async (page: Page) => {
  const tenant = {
    id: "t-system",
    slug: "system",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
    expires_at: null,
    description: "",
    version: 1,
    created_at: "",
    updated_at: "",
  };
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        principal: {
          kind: "user_session",
          user: {
            id: "u-admin",
            tenant_id: "t-system",
            username: "admin",
            display_name: "Super Administrator",
            status: "active",
            must_change_password: false,
            last_login_at: null,
            role_ids: ["r-platform-admin"],
            role_codes: ["platform_super_admin"],
            version: 1,
            created_at: "",
            updated_at: "",
          },
          home_tenant: tenant,
          effective_tenant: tenant,
          roles: [],
          permissions: ["system.config.read", "dashboard.read"],
          platform_admin: true,
        },
      }),
    }),
  );
  // Order matters: Playwright tries the most recently registered route first, so
  // the catch-all has to be registered before the specific one it must not shadow.
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/v0/management/video-generation/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [VIDEO_MODEL] }),
    }),
  );
};

test("renders the video call docs with a highlighted snippet", async ({ page }) => {
  await seedAuth(page);
  await mockApis(page);
  await page.goto("/#/models/video-generation");

  await expect(page.getByRole("heading", { name: "视频模型" })).toBeVisible();

  const codeBlock = page.locator("[data-code-block]").first();
  await expect(codeBlock).toContainText("curl http://127.0.0.1:8317/v1/videos/generations");
  await expect(codeBlock).toContainText("/v1/videos/$REQUEST_ID");

  // Highlighting must produce coloured token spans, not one flat text node.
  const tokenColours = await codeBlock.evaluate((element) => {
    const spans = [...element.querySelectorAll("span")];
    return new Set(spans.map((span) => getComputedStyle(span).color)).size;
  });
  expect(tokenColours).toBeGreaterThan(2);

  await page.getByRole("tab", { name: "图生视频" }).click();
  await expect(page.locator("[data-code-block]").first()).toContainText('"image": { "url"');

  await expect(page.getByText("请求参数")).toBeVisible();
  await expect(page.getByText("返回结构")).toBeVisible();
});

test("enables the test panel from the served model catalog", async ({ page }) => {
  await seedAuth(page);
  await mockApis(page);
  await page.goto("/#/models/video-generation");

  // The button stays disabled until the catalog answers, which is what made the
  // panel unreachable when the models call was shadowed by a catch-all mock.
  const testButton = page.getByRole("button", { name: "测试生成" });
  await expect(testButton).toBeEnabled();

  await testButton.click();
  await expect(page.getByText("测试视频生成")).toBeVisible();
  await expect(page.getByText(VIDEO_MODEL.id, { exact: false }).first()).toBeVisible();
});
