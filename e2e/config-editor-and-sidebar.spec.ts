import { expect, test, type Page } from "@playwright/test";

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
      }),
    );
  });
};

test("Config: page should not horizontally scroll; editor should allow horizontal scroll", async ({
  page,
}) => {
  await setAuthed(page);

  const longValue = "a".repeat(2500);
  const yaml = `long_key: "${longValue}"\n`;

  await page.route("**/v0/management/config.yaml", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/yaml; charset=utf-8",
      body: yaml,
    });
  });

  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/config");
  await page.getByRole("button", { name: "源代码编辑" }).click();

  const editor = page.getByLabel("config.yaml 编辑器");
  await expect(editor).toBeVisible();

  const overflowX = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflowX).toBeLessThanOrEqual(1);

  const editorCanScroll = await editor.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    const before = ta.scrollLeft;
    const canOverflow = ta.scrollWidth > ta.clientWidth;
    ta.scrollLeft = 120;
    const after = ta.scrollLeft;
    return { canOverflow, moved: after > before };
  });

  expect(editorCanScroll.canOverflow).toBe(true);
  expect(editorCanScroll.moved).toBe(true);
});

test("Sidebar: collapse/expand should keep nav items nowrap and slide out of view", async ({ page }) => {
  await setAuthed(page);

  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/v0/management/config.yaml", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/yaml; charset=utf-8",
      body: "a: 1\n",
    });
  });

  await page.goto("/#/config");

  const dashboardLink = page.getByRole("link", { name: "仪表盘" });
  await expect(dashboardLink).toBeVisible();

  const linkWhiteSpace = await dashboardLink.evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(linkWhiteSpace).toBe("nowrap");

  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();

  const aside = page.locator("aside");
  await expect.poll(async () => {
    return await aside.evaluate((el) => el.getBoundingClientRect().width);
  }).toBeLessThan(2);

  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(page.getByRole("button", { name: "收起侧边栏" })).toBeVisible();
  await expect.poll(async () => {
    return await aside.evaluate((el) => el.getBoundingClientRect().width);
  }).toBeGreaterThan(200);
});
