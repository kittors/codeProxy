import { expect, test, type Page } from "@playwright/test";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const readAllowedClients = (value: unknown): string[] => {
  if (!isRecord(value) || !Array.isArray(value.allowed_clients)) return [];
  return value.allowed_clients.filter(
    (item): item is string => typeof item === "string",
  );
};

const MODELS_SECTION = /^(Models & Routing|模型与调度)$/;

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

// 预览模式只跳过「恢复会话」时的后端校验：登录早已改成用户名 + 密码、必须走后端，
// 这条用例原来填个密码就断言 aside 可见，是靠旧登录页里恰好有一个 <aside> 才通过的。
test("Local preview: a stored key opens the console without a backend", async ({ page }) => {
  await setAuthed(page);
  await page.goto("/manage/?preview=1#/dashboard");
  await expect(page.locator("aside[data-collapsed]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: /^(Sections|分区)$/ })).toBeVisible();
});

test("Config: page should not horizontally scroll; editor should allow horizontal scroll", async ({
  page,
}) => {
  await setAuthed(page);

  const longValue = `${"a".repeat(2500)}horizontal-target`;
  const yaml = [
    `long_key: "${longValue}"`,
    ...Array.from({ length: 80 }, (_, index) => `key-${index}: value-${index}`),
    "target-key: target-value",
  ].join("\n");

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

  const search = page.getByPlaceholder(/Search config content|搜索配置内容/i);
  await editor.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await search.fill("horizontal-target");
  await search.press("Enter");
  await expect
    .poll(async () => editor.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);

  await search.fill("target-key");
  await search.press("Enter");
  await expect
    .poll(async () => editor.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const syncedScroll = await editor.evaluate((element) => ({
    editor: element.scrollTop,
    highlight: element.parentElement?.querySelector("pre")?.scrollTop,
    gutter: element.parentElement?.previousElementSibling?.scrollTop,
  }));
  expect(syncedScroll.highlight).toBe(syncedScroll.editor);
  expect(syncedScroll.gutter).toBe(syncedScroll.editor);
});

test("Config visual editor shows descriptions inline and jumps between sections", async ({
  page,
}) => {
  await setAuthed(page);

  await page.route("**/v0/management/config.yaml", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/yaml; charset=utf-8",
      body: "host: 0.0.0.0\nport: 8318\n",
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

  // 说明常驻显示（不再只藏在 ⓘ 提示里），YAML 键附在说明后面。
  const description = page.getByText(/Leave empty to listen on every interface|留空监听所有网卡/);
  await expect(description).toBeVisible();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  // 分组是内容上方的页签：切到「运行」，再点分区胶囊跳到对应分区，胶囊高亮跟着走。
  await page.getByRole("tab", { name: /^(Behavior|运行)/ }).click();
  const nav = page.getByRole("navigation", { name: /Config sections|配置分区/ });
  await nav.getByRole("button", { name: /Streaming|流式传输/ }).click();
  await expect(page.getByRole("heading", { name: /^(Streaming|流式传输)$/ })).toBeInViewport();
  await expect(nav.getByRole("button", { name: /Streaming|流式传输/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("Sidebar: single sidebar with folding sections, collapsed flyouts and account menu", async ({
  page,
}) => {
  await setAuthed(page);
  await page.setViewportSize({ width: 1280, height: 640 });

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

  const aside = page.locator("aside");
  const rail = page.getByRole("navigation", { name: /^(Sections|分区)$/ });
  const systemSection = rail.getByRole("button", { name: /^(System Settings|系统设置)$/ });
  await expect(rail.getByRole("link", { name: /Dashboard|仪表盘/i })).toBeVisible();
  await expect(systemSection).toHaveAttribute("data-active", "true");

  // 当前页所在的分区自动展开，当前页是灰底上的白色小卡片而不是彩色渐变。
  await expect(systemSection).toHaveAttribute("aria-expanded", "true");
  const systemList = page.getByRole("group", { name: /^(System Settings|系统设置)$/ });
  const configLink = systemList.getByRole("link", { name: /^Config|配置面板$/i });
  await expect(configLink).toHaveAttribute("aria-current", "page");
  await expect(configLink).toHaveClass(/bg-surface/);
  await expect(configLink).not.toHaveClass(/from-blue-600/);
  expect(await configLink.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
  await expect(page.getByRole("banner")).toContainText(/System Settings|系统设置/);

  // Logo 与收起按钮叠在同一位置：平时显示 Logo，悬停换成侧栏图标。
  const toggle = aside.locator("[data-sidebar-toggle='true']");
  const logo = toggle.locator("[data-sidebar-logo='true']");
  await page.mouse.move(760, 300);
  await expect.poll(async () => Number(await logo.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThan(0.95);
  await toggle.hover();
  await expect.poll(async () => Number(await logo.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.05);
  await expect(toggle).toHaveAccessibleName(/Collapse Sidebar|收起侧边栏/i);

  // 只有一条侧边栏：内容区紧挨着它，中间没有第二列面板。
  const asideBox = await aside.boundingBox();
  const mainSurface = page.locator("#main-content").locator("xpath=../..");
  const mainBox = await mainSurface.boundingBox();
  expect((mainBox?.x ?? 0) - ((asideBox?.x ?? 0) + (asideBox?.width ?? 0))).toBeLessThan(12);

  // 点分区标题展开它的页面列表（不跳页），再点一次收起。
  const modelsSection = rail.getByRole("button", { name: MODELS_SECTION });
  const modelsList = page.getByRole("group", { name: MODELS_SECTION });
  await modelsSection.click();
  await expect(modelsSection).toHaveAttribute("aria-expanded", "true");
  await expect(modelsList.getByRole("link").first()).toBeVisible();
  await expect(page).toHaveURL(/#\/system\/config$/);
  await modelsSection.click();
  await expect(modelsSection).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => modelsList.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(1);

  // 收起：只剩图标栏，内容区仍是圆角卡片，选择会被记住。
  await toggle.click();
  await expect(aside).toHaveAttribute("data-collapsed", "true");
  await expect.poll(() => aside.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(76);
  await expect.poll(() => mainSurface.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThan(8);
  expect(await page.evaluate(() => localStorage.getItem("cli-proxy-sidebar-collapsed"))).toBe("1");

  // 收起态悬停分区弹出浮层；点了页面后浮层收起；键盘聚焦打开、Esc 关闭并回到图标。
  const systemFlyout = page.getByRole("menu", { name: /^(System Settings|系统设置)$/ });
  await systemSection.hover();
  await expect(systemFlyout).toBeVisible();
  await expect(systemSection).toHaveAttribute("aria-expanded", "true");
  await systemFlyout.getByRole("menuitem", { name: /^Config|配置面板$/i }).click();
  await expect(systemFlyout).toHaveCount(0);
  await page.mouse.move(760, 300);
  await systemSection.focus();
  await expect(systemFlyout).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(systemFlyout).toHaveCount(0);
  await expect(systemSection).toBeFocused();

  // ⌘B / Ctrl+B 展开回来。
  await page.mouse.move(760, 300);
  await page.locator("body").press("ControlOrMeta+b");
  await expect(aside).toHaveAttribute("data-collapsed", "false");
  await expect.poll(() => aside.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(220);

  // 账号菜单：从侧边栏底部的账号行上方弹出，和语言菜单用同一套浮层表面。
  const accountTrigger = aside.getByRole("button", { name: "Admin" });
  const accountTriggerBox = await accountTrigger.boundingBox();
  await accountTrigger.click();
  const accountMenu = page.locator("[data-sidebar-account-menu='true']");
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu).toHaveClass(/code-proxy-floating-surface/);
  await expect(page.getByRole("menuitem", { name: /^Config|配置面板$/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Logout|退出登录/i })).toBeVisible();
  await page.waitForTimeout(220);
  const accountMenuBox = await accountMenu.boundingBox();
  expect((accountMenuBox?.y ?? 0) + (accountMenuBox?.height ?? 0)).toBeLessThanOrEqual(accountTriggerBox?.y ?? 0);
  expect(Math.abs((accountMenuBox?.x ?? 0) - (accountTriggerBox?.x ?? 0))).toBeLessThan(4);
  const surfaceStyle = (el: Element) => {
    const style = getComputedStyle(el);
    return { borderRadius: style.borderRadius, boxShadow: style.boxShadow, background: style.backgroundColor };
  };
  const accountSurfaceStyle = await accountMenu.evaluate(surfaceStyle);
  await page.keyboard.press("Escape");
  await expect(accountMenu).toBeHidden();

  await page.locator("header button[aria-haspopup='listbox']").click();
  const languageMenu = page.locator("[role='listbox'].code-proxy-floating-surface");
  await expect(languageMenu).toBeVisible();
  expect(await languageMenu.evaluate(surfaceStyle)).toEqual(accountSurfaceStyle);
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

test("Config: unified visual editor confirms the low-resource profile cleanup", async ({
  page,
}) => {
  await setAuthed(page);

  let currentYaml = [
    "port: 8318",
    "request-log-storage:",
    "  store-content: true",
    "  content-retention-days: 30",
    "  cleanup-interval-minutes: 1440",
    "  max-total-size-mb: 1024",
  ].join("\n");
  const savedYaml: string[] = [];
  const cleanupPayloads: unknown[] = [];

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/v0/management/config.yaml")) {
      if (request.method() === "PUT") {
        currentYaml = request.postData() ?? "";
        savedYaml.push(currentYaml);
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
      return;
    }

    if (path.endsWith("/v0/management/request-log-storage/store-content")) {
      cleanupPayloads.push(JSON.parse(request.postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: false,
          cleanup: { physical_reclaim_deferred: true },
        }),
      });
      return;
    }

    if (path.endsWith("/v0/management/codex-oauth-admission")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ allowed_clients: [], available_allowed_clients: [] }),
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

  await expect(page.getByRole("tab", { name: /可视化编辑|Visual Editor/i })).toBeVisible();
  // 监控相关设置在「日志与数据」分组页签里；推荐档位横幅在这一组也显示。
  await page.getByRole("tab", { name: /^(日志与数据|Logs & data)/ }).click();
  await expect(page.getByText(/监控连接轮换周期|Monitor connection rotation/i)).toBeVisible();
  await expect(page.getByRole("tab", { name: /源码编辑|Source Editor/i })).toBeVisible();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText(/监控连接轮换周期|Monitor connection rotation/i)).toBeVisible();
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX).toBeLessThanOrEqual(1);
  await expect(page.getByRole("tab", { name: /运行时配置|Runtime Config/i })).toHaveCount(0);

  await page.getByRole("button", { name: /应用推荐值|Apply recommended values/i }).click();
  await page.getByRole("button", { name: /^保存$|^Save$/i }).click();

  const dialog = page.getByRole("dialog", { name: /确认高影响配置变更|Review high-impact/i });
  await expect(dialog).toContainText(/历史请求与响应正文|historical request and response bodies/i);
  await dialog.getByRole("button", { name: /仍要保存|Save anyway/i }).click();

  await expect.poll(() => savedYaml.length).toBe(1);
  expect(savedYaml[0]).toContain("store-content: false");
  expect(savedYaml[0]).toContain("system-stats-websocket-max-age-seconds: 300");
  await expect.poll(() => cleanupPayloads.length).toBe(1);
  expect(cleanupPayloads[0]).toEqual({ value: false, clear_existing: true });
});

test("Config: tenant Codex OAuth admission stays available in the unified visual editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);

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

  // Codex 客户端准入在「高级」分组页签里。
  await page.getByRole("tab", { name: /^(高级|Advanced)/ }).click();
  const panel = page.getByTestId("codex-oauth-global-admission-panel");
  await expect(panel).toBeVisible();

  const preset = page.getByTestId("codex-oauth-global-preset-claude_code");
  await expect(preset).not.toBeChecked();
  await preset.click();
  await page.getByRole("button", { name: /Confirm change|确认变更/i }).click();

  await expect.poll(() => savedPayloads.length).toBe(1);
  expect(readAllowedClients(savedPayloads[0])).toEqual(["claude_code"]);
  await expect(preset).toBeChecked();
});
