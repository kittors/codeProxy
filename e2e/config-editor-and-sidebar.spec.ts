import { expect, test, type Page } from "@playwright/test";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readAllowedClients = (value: unknown): string[] => {
  if (!isRecord(value) || !Array.isArray(value.allowed_clients)) return [];
  return value.allowed_clients.filter(
    (item): item is string => typeof item === "string",
  );
};

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

test("Local preview: accepts any non-empty management key without a backend", async ({
  page,
}) => {
  await page.goto("/manage/?preview=1#/login");
  await page.locator('input[type="password"]').fill("anything");
  await page.getByRole("button", { name: /Login|登录/i }).click();
  await expect(page.locator("aside")).toBeVisible();
});

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

  await page.goto("/#/system/config");
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
  await page.setViewportSize({ width: 1280, height: 520 });

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

  await page.goto("/#/system/config");

  const dashboardLink = page.getByRole("link", { name: /Dashboard|仪表盘/i });
  await expect(dashboardLink).toBeVisible();

  const systemGroup = page.getByRole("button", { name: /System|系统管理/i });
  await expect(systemGroup).toHaveAttribute("aria-expanded", "true");

  const requestLogsLink = page.getByRole("link", {
    name: /Request Logs|请求日志/i,
  });
  await expect(requestLogsLink).toBeVisible();
  await expect(requestLogsLink).toHaveCSS("font-size", "14px");

  const runtimeGroup = page.getByRole("button", { name: /Operations|运行监控/i });
  const iconLabelGaps = await Promise.all(
    [dashboardLink, runtimeGroup, requestLogsLink].map((row) =>
      row.evaluate((element) => {
        const icon = element.querySelector("svg");
        const label = element.children.item(1);
        if (!icon || !(label instanceof HTMLElement)) {
          throw new Error("Missing sidebar icon or label");
        }
        return label.getBoundingClientRect().left - icon.getBoundingClientRect().right;
      }),
    ),
  );
  for (const gap of iconLabelGaps) {
    expect(gap).toBeGreaterThanOrEqual(11);
    expect(gap).toBeLessThanOrEqual(13);
  }

  const configLink = page.getByRole("link", { name: /^Config|配置面板$/i });
  await expect(configLink).toHaveAttribute("aria-current", "page");
  await expect(configLink).toHaveClass(/bg-slate-100/);
  await expect(configLink).not.toHaveClass(/from-blue-600/);

  const modelsGroup = page.getByRole("button", {
    name: /Models & Routing|模型与路由/i,
  });
  await expect(modelsGroup).toHaveAttribute("aria-expanded", "false");
  await modelsGroup.click();
  await expect(
    page.getByRole("link", { name: /^Models|模型管理$/i }),
  ).toBeVisible();
  const modelsIconBeforeCollapse = await modelsGroup
    .locator("svg")
    .first()
    .boundingBox();

  const linkWhiteSpace = await dashboardLink.evaluate(
    (el) => getComputedStyle(el).whiteSpace,
  );
  expect(linkWhiteSpace).toBe("nowrap");

  const aside = page.locator("aside");
  const sidebarScrollbar = aside.locator("[data-scroll-area-scrollbar='y']");
  await expect(sidebarScrollbar).toHaveCount(1);
  await page.mouse.move(760, 120);
  await expect
    .poll(async () =>
      Number(
        await sidebarScrollbar.evaluate((el) => getComputedStyle(el).opacity),
      ),
    )
    .toBeLessThan(0.05);

  await dashboardLink.hover();
  await expect
    .poll(async () =>
      Number(
        await sidebarScrollbar.evaluate((el) => getComputedStyle(el).opacity),
      ),
    )
    .toBeGreaterThan(0.95);

  await page.mouse.move(760, 120);
  await expect
    .poll(async () =>
      Number(
        await sidebarScrollbar.evaluate((el) => getComputedStyle(el).opacity),
      ),
    )
    .toBeLessThan(0.05);

  const collapseButton = page.getByRole("button", {
    name: /Collapse Sidebar|收起侧边栏/i,
  });
  await expect
    .poll(async () =>
      Number(await collapseButton.evaluate((el) => getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.95);
  await aside.hover();
  const toggleIconClass = await collapseButton
    .locator("svg")
    .getAttribute("class");
  await collapseButton.click();

  const expandButton = page.getByRole("button", {
    name: /Expand Sidebar|展开侧边栏/i,
  });
  const sidebarLogo = aside.locator("[data-sidebar-logo='true']");
  const sidebarToggle = aside.locator("[data-sidebar-toggle='true']");
  await expect(sidebarLogo).toHaveCSS("box-shadow", "none");
  await page.mouse.move(760, 120);
  await expect
    .poll(async () =>
      Number(
        await sidebarLogo.evaluate(
          (el) => getComputedStyle(el.parentElement!).opacity,
        ),
      ),
    )
    .toBeGreaterThan(0.95);
  await expect
    .poll(async () =>
      Number(
        await sidebarToggle.evaluate((el) => getComputedStyle(el).opacity),
      ),
    )
    .toBeLessThan(0.05);
  await aside.hover();
  await expect(expandButton).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        await sidebarLogo.evaluate(
          (el) => getComputedStyle(el.parentElement!).opacity,
        ),
      ),
    )
    .toBeLessThan(0.05);
  await expect
    .poll(async () =>
      Number(
        await sidebarToggle.evaluate((el) => getComputedStyle(el).opacity),
      ),
    )
    .toBeGreaterThan(0.95);
  expect(await sidebarToggle.boundingBox()).toEqual(
    await sidebarLogo.boundingBox(),
  );
  await expect(sidebarToggle).toHaveCSS("border-top-width", "0px");
  const toggleBox = await sidebarToggle.boundingBox();
  const accountButtonBox = await aside
    .locator("[data-sidebar-account-avatar='true']")
    .boundingBox();
  const collapsedDashboardBox = await page
    .getByRole("link", { name: /Dashboard|仪表盘/i })
    .locator("svg")
    .boundingBox();
  const toggleCenter = (toggleBox?.x ?? 0) + (toggleBox?.width ?? 0) / 2;
  expect((accountButtonBox?.x ?? 0) + (accountButtonBox?.width ?? 0) / 2).toBe(
    toggleCenter,
  );
  expect(
    (collapsedDashboardBox?.x ?? 0) + (collapsedDashboardBox?.width ?? 0) / 2,
  ).toBe(toggleCenter);
  await expect(expandButton.locator("svg")).toHaveAttribute(
    "class",
    toggleIconClass ?? "",
  );

  await expect
    .poll(async () => {
      return await aside.evaluate((el) => el.getBoundingClientRect().width);
    })
    .toBeGreaterThan(60);
  await expect
    .poll(async () => {
      return await aside.evaluate((el) => el.getBoundingClientRect().width);
    })
    .toBeLessThan(76);

  const collapsedModelsGroup = page.getByRole("button", {
    name: /Models & Routing|模型与路由/i,
  });
  const railPositionBefore = await collapsedModelsGroup.boundingBox();
  await collapsedModelsGroup.hover();
  await expect(
    page.getByRole("menuitem", { name: /^Models$|^模型管理$/i }),
  ).toBeVisible();
  const modelsFlyout = aside.locator("[data-sidebar-flyout='models']");
  await expect(modelsFlyout).toHaveAttribute("data-open", "true");
  await expect
    .poll(async () =>
      Number(await modelsFlyout.evaluate((el) => getComputedStyle(el).opacity)),
    )
    .toBeGreaterThan(0.95);
  const railPositionAfter = await collapsedModelsGroup.boundingBox();
  const modelsIconAfterCollapse = await collapsedModelsGroup
    .locator("svg")
    .first()
    .boundingBox();
  expect(railPositionAfter?.x).toBe(railPositionBefore?.x);
  expect(railPositionAfter?.y).toBe(railPositionBefore?.y);
  expect(modelsIconAfterCollapse?.x).toBe(modelsIconBeforeCollapse?.x);
  expect(modelsIconAfterCollapse?.width).toBe(modelsIconBeforeCollapse?.width);
  expect(modelsIconAfterCollapse?.height).toBe(
    modelsIconBeforeCollapse?.height,
  );
  await expect(page.getByRole("button", { name: "Admin" })).toBeVisible();

  const collapsedSystemGroup = page.getByRole("button", {
    name: /System|系统管理/i,
  });
  const systemFlyout = aside.locator("[data-sidebar-flyout='system']");
  await collapsedSystemGroup.hover();
  await expect(systemFlyout).toHaveAttribute("data-open", "true");
  const flyoutConfigLink = page.getByRole("menuitem", {
    name: /^Config|配置面板$/i,
  });
  await flyoutConfigLink.click();
  await expect(systemFlyout).toHaveAttribute("data-open", "false");
  await expect
    .poll(async () =>
      Number(await systemFlyout.evaluate((el) => getComputedStyle(el).opacity)),
    )
    .toBeLessThan(0.05);
  await page.waitForTimeout(220);
  await expect(systemFlyout).toHaveAttribute("data-open", "false");

  await page.mouse.move(760, 120);
  await collapsedSystemGroup.focus();
  await expect(systemFlyout).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(systemFlyout).toHaveAttribute("data-open", "false");
  await expect(collapsedSystemGroup).toBeFocused();

  await page.mouse.move(760, 120);
  await collapsedSystemGroup.hover();
  await expect(systemFlyout).toHaveAttribute("data-open", "true");
  await page.mouse.move(760, 120);
  await expect(systemFlyout).toHaveAttribute("data-open", "false");

  const asideBox = await aside.boundingBox();
  const expandButtonBox = await expandButton.boundingBox();
  expect(expandButtonBox?.x).toBeGreaterThanOrEqual(asideBox?.x ?? 0);
  expect(
    (expandButtonBox?.x ?? 0) + (expandButtonBox?.width ?? 0),
  ).toBeLessThanOrEqual((asideBox?.x ?? 0) + (asideBox?.width ?? 0));

  const collapsedDashboard = page.getByRole("link", {
    name: /Dashboard|仪表盘/i,
  });
  const dashboardBox = await collapsedDashboard.boundingBox();
  expect(dashboardBox?.x).toBeGreaterThan(asideBox?.x ?? 0);
  expect(dashboardBox?.width).toBeLessThan(
    asideBox?.width ?? Number.POSITIVE_INFINITY,
  );

  const collapsedGroupBoxes = await Promise.all(
    [
      /Operations|运行监控/i,
      /Access|接入管理/i,
      /Models & Routing|模型与路由/i,
      /Governance|租户治理/i,
      /System|系统管理/i,
    ].map(async (name) => page.getByRole("button", { name }).boundingBox()),
  );
  for (let index = 1; index < collapsedGroupBoxes.length; index += 1) {
    expect(
      (collapsedGroupBoxes[index]?.y ?? 0) -
        (collapsedGroupBoxes[index - 1]?.y ?? 0),
    ).toBeLessThan(60);
  }

  await aside.hover();
  await expandButton.click();
  await aside.hover();
  await expect(
    page.getByRole("button", { name: /Collapse Sidebar|收起侧边栏/i }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      return await aside.evaluate((el) => el.getBoundingClientRect().width);
    })
    .toBeGreaterThan(220);

  const accountTrigger = page.getByRole("button", { name: "Admin" });
  await expect(accountTrigger.locator("svg")).toHaveCount(0);
  await accountTrigger.hover();
  await expect
    .poll(async () =>
      accountTrigger.evaluate((el) => getComputedStyle(el).boxShadow),
    )
    .not.toBe("none");
  await expect(
    page.getByRole("button", { name: /Logout|退出登录/i }),
  ).toHaveCount(0);
  const accountTriggerBox = await accountTrigger.boundingBox();
  await accountTrigger.click();
  const accountMenu = page.locator("[data-sidebar-account-menu='true']");
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu).toHaveClass(/code-proxy-floating-surface/);
  await expect(accountMenu).toHaveCSS("border-radius", "12px");
  await expect(
    page.getByRole("menuitem", { name: /Account & Security|账号与安全/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /^Config|配置面板$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /Logout|退出登录/i }),
  ).toBeVisible();
  await page.waitForTimeout(220);
  const accountMenuBox = await accountMenu.boundingBox();
  const accountSurfaceStyle = await accountMenu.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderColor: style.borderTopColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(Math.abs((accountMenuBox?.width ?? 0) - (accountTriggerBox?.width ?? 0))).toBeLessThan(1);
  expect((accountMenuBox?.y ?? 0) + (accountMenuBox?.height ?? 0)).toBeLessThan(
    accountTriggerBox?.y ?? 0,
  );
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();

  const languageTrigger = page.locator("header button[aria-haspopup='listbox']");
  await languageTrigger.click();
  const languageMenu = page.locator("[role='listbox'].code-proxy-floating-surface");
  await expect(languageMenu).toBeVisible();
  const languageSurfaceStyle = await languageMenu.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      borderColor: style.borderTopColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(languageSurfaceStyle).toEqual(accountSurfaceStyle);
  await page.keyboard.press("Escape");
  await expect(languageMenu).toBeHidden();
});

test("API Keys: table should scroll vertically when many keys are listed", async ({
  page,
}) => {
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

  const tableScroller = page
    .locator("[data-vt-scroll-content]")
    .locator("xpath=..");
  await expect(tableScroller).toBeVisible();

  await expect
    .poll(async () => {
      return await tableScroller.evaluate(
        (el) => el.scrollHeight - el.clientHeight,
      );
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

  await page.goto("/#/system/config");
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

test("Config: global Codex OAuth allowed-client preset should persist through runtime settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await page.addInitScript(() => {
    localStorage.setItem("config-panel:tab", "runtime");
  });

  let allowedClients: string[] = [];
  const savedPayloads: unknown[] = [];

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/codex-oauth-admission")) {
      if (request.method() === "PUT") {
        const payload: unknown = JSON.parse(request.postData() ?? "{}");
        savedPayloads.push(payload);
        allowedClients = readAllowedClients(payload);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          allowed_clients: allowedClients,
          available_allowed_clients: [
            {
              id: "claude_code",
              label: "Claude Code",
              description:
                "Allow the Claude Code Codex plugin when Originator and User-Agent both match.",
            },
          ],
        }),
      });
      return;
    }

    if (path.endsWith("/v0/management/config.yaml")) {
      await route.fulfill({
        status: 200,
        contentType: "text/yaml; charset=utf-8",
        body: "logging-to-file: false\n",
      });
      return;
    }

    if (path.endsWith("/v0/management/logs-max-total-size-mb")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "logs-max-total-size-mb": 128 }),
      });
      return;
    }

    if (path.endsWith("/v0/management/force-model-prefix")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "force-model-prefix": false }),
      });
      return;
    }

    if (path.endsWith("/v0/management/routing/strategy")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ strategy: "round-robin" }),
      });
      return;
    }

    if (path.endsWith("/v0/management/auto-update/enabled")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: true }),
      });
      return;
    }

    if (path.endsWith("/v0/management/auto-update/channel")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ channel: "main" }),
      });
      return;
    }

    if (path.endsWith("/v0/management/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "ws-auth": true, "request-retry": 2 }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/system/config");

  const panel = page.getByTestId("codex-oauth-global-admission-panel");
  await expect(panel).toBeVisible();

  const preset = page.getByTestId("codex-oauth-global-preset-claude_code");
  await expect(preset).not.toBeChecked();
  await preset.click();

  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(readAllowedClients(savedPayloads[0])).toEqual(["claude_code"]);
  await expect(preset).toBeChecked();
});
