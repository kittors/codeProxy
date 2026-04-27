import { expect, test, type Page } from "@playwright/test";

const setAuthed = async (page: Page) => {
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
  await page.getByRole("tab", { name: /Source Editor|源码编辑/i }).click();

  const editor = page.getByLabel(/config\.yaml (editor|编辑器)/i);
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

test("Sidebar: collapse/expand should keep nav items nowrap and slide out of view", async ({
  page,
}) => {
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

  const dashboardLink = page.getByRole("link", { name: /Dashboard|仪表盘/i });
  await expect(dashboardLink).toBeVisible();

  const linkWhiteSpace = await dashboardLink.evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(linkWhiteSpace).toBe("nowrap");

  await page.getByRole("button", { name: /Collapse Sidebar|收起侧边栏/i }).click();
  await expect(page.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i })).toBeVisible();

  const aside = page.locator("aside");
  await expect
    .poll(async () => {
      return await aside.evaluate((el) => el.getBoundingClientRect().width);
    })
    .toBeLessThan(2);

  await page.getByRole("button", { name: /Expand Sidebar|展开侧边栏/i }).click();
  await expect(page.getByRole("button", { name: /Collapse Sidebar|收起侧边栏/i })).toBeVisible();
  await expect
    .poll(async () => {
      return await aside.evaluate((el) => el.getBoundingClientRect().width);
    })
    .toBeGreaterThan(200);
});

test("API Keys: table should scroll vertically when many keys are listed", async ({ page }) => {
  await setAuthed(page);

  const entries = Array.from({ length: 80 }, (_, index) => ({
    key: `sk-e2e-scroll-${String(index).padStart(3, "0")}`,
    name: `Scroll Key ${String(index + 1).padStart(2, "0")}`,
    "created-at": "2026-04-14T00:00:00.000Z",
  }));

  await page.route("**/v0/management/**", async (route) => {
    const url = route.request().url();

    if (url.endsWith("/v0/management/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }

    if (url.endsWith("/v0/management/api-key-entries")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "api-key-entries": entries }),
      });
      return;
    }

    if (url.endsWith("/v0/management/api-keys")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "api-keys": [] }),
      });
      return;
    }

    if (url.endsWith("/v0/management/channel-groups")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }

    if (url.endsWith("/v0/management/auth-files")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: [] }),
      });
      return;
    }

    if (url.endsWith("/v0/management/models")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/api-keys");

  const tableScroller = page.locator(".table-scrollbar");
  await expect(tableScroller).toBeVisible();

  await expect
    .poll(async () => {
      return await tableScroller.evaluate((el) => el.scrollHeight - el.clientHeight);
    })
    .toBeGreaterThan(100);

  await tableScroller.hover();
  await page.mouse.wheel(0, 600);

  await expect
    .poll(async () => {
      return await tableScroller.evaluate((el) => el.scrollTop);
    })
    .toBeGreaterThan(0);
});

test("Config: source editor save should persist edited yaml through save path", async ({
  page,
}) => {
  await setAuthed(page);

  let currentYaml = "server:\n  host: 127.0.0.1\n";
  const savedPayloads: string[] = [];

  await page.route("**/v0/management/config.yaml", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postData() ?? "";
      savedPayloads.push(payload);
      currentYaml = payload;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/yaml; charset=utf-8",
      body: currentYaml,
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
  await page.getByRole("tab", { name: /源代码编辑|Source Editor/i }).click();

  const editor = page.getByLabel(/config\.yaml (editor|编辑器)/i);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(currentYaml);

  const nextYaml = "server:\n  host: 127.0.0.1\n  port: 8317\n";
  await editor.fill(nextYaml);

  const saveButton = page.getByRole("button", { name: /^保存$|^Save$/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(savedPayloads[0]).toBe(nextYaml);
  await expect(editor).toHaveValue(nextYaml);
});
