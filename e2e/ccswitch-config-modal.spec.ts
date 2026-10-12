import { expect, test, type Page } from "@playwright/test";

/**
 * Regression cover for the CC Switch preset editor.
 *
 *  - Light mode: controls keep their shadow edge instead of melting into the white dialog.
 *  - The dialog body owns the only vertical scroll area: every Claude Code tier stays
 *    reachable, and the import preview scrolls with the form.
 *  - Presets saved by the earlier editor keep their request names: a cleared tier moves to
 *    the "names kept for imported clients" list instead of disappearing.
 */

const CONFIG = {
  id: "cfg-grok-claude",
  "client-type": "claude",
  "provider-name": "grok 版本的 claude code",
  note: "grok 版本的 claude code",
  "route-path": "/grok/cs_grok01",
  "endpoint-path": "",
  "default-model": "grok-4.5",
  "allowed-channel-groups": ["grok"],
  "api-key-field": "ANTHROPIC_API_KEY",
  "usage-auto-interval": 30,
  "model-mappings": [
    { role: "main", "request-model": "claude-fable-5", "target-model": "grok-4.5" },
    { role: "haiku", "request-model": "claude-haiku-4-5", "target-model": "grok-4.5" },
    { role: "sonnet", "request-model": "claude-sonnet-5", "target-model": "grok-4.5" },
    { role: "opus", "request-model": "claude-opus-4-8", "target-model": "grok-4.5" },
    { role: "fable", "request-model": "claude-fable-5", "target-model": "grok-4.5" },
  ],
};

const CLAUDE_ROLE_LABELS = [
  "主模型",
  "Haiku 默认模型",
  "Sonnet 默认模型",
  "Opus 默认模型",
  "Fable 默认模型",
];

const setup = async (
  page: Page,
  { dark = false, clientTypes }: { dark?: boolean; clientTypes?: string[] } = {},
) => {
  await page.addInitScript(
    ([isDark]) => {
      localStorage.setItem(
        "code-proxy-admin-auth",
        JSON.stringify({
          apiBase: "http://127.0.0.1:8317",
          managementKey: "test-management-key",
          rememberPassword: true,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        }),
      );
      // The app JSON.parses this key, so a bare string would be ignored.
      localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
      localStorage.setItem("code-proxy-admin-theme", isDark ? "dark" : "light");
      if (isDark) document.documentElement.classList.add("dark");
    },
    [dark],
  );

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/v0/management/channel-groups*", (route) =>
    route.fulfill(
      json({
        items: [
          {
            name: "grok",
            description: "xAI Grok 渠道",
            "path-routes": ["/grok"],
            channels: ["grok"],
            "allowed-models": ["grok-4.5", "grok-4.5-fast", "grok-code-fast-1"],
          },
        ],
      }),
    ),
  );
  await page.route("**/v0/management/ccswitch-import-configs", (route) =>
    route.fulfill(
      json({
        "ccswitch-import-configs": [CONFIG],
        ...(clientTypes ? { "client-types": clientTypes } : {}),
      }),
    ),
  );
  await page.route("**/v0/management/auth-group-model-owner-mappings*", (route) =>
    route.fulfill(json({ items: [] })),
  );
  await page.route("**/v0/management/models*", (route) =>
    route.fulfill(
      json({
        data: [
          { id: "grok-4.5", owned_by: "grok" },
          { id: "grok-4.5-fast", owned_by: "grok" },
          { id: "grok-code-fast-1", owned_by: "grok" },
        ],
      }),
    ),
  );
  await page.route("**/v0/management/model-configs*", (route) =>
    route.fulfill(json({ items: [] })),
  );
  await page.route("**/v0/management/model-owner-presets*", (route) =>
    route.fulfill(json({ items: [] })),
  );
  await page.route("**/v0/management/config", (route) => route.fulfill(json({})));
  await page.route("**/v0/management/update/check*", (route) =>
    route.fulfill(json({ "update-available": false })),
  );
};

const openEditor = async (page: Page) => {
  await page.goto("/#/access/ccswitch-import-settings");
  await page.getByRole("button", { name: "编辑配置" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("ccswitch-import-preview")).toBeVisible();
};

test("每个 Claude 档位都能直接看到，弹窗只有正文一个纵向滚动区", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await openEditor(page);

  const dialog = page.getByRole("dialog");
  // Nothing inside the form or the preview scrolls vertically on its own.
  const innerScrollers = await dialog.evaluate((root) => {
    const body = root.querySelector(".overflow-y-auto");
    const nodes = Array.from(body?.querySelectorAll("*") ?? []) as HTMLElement[];
    return nodes
      .filter((node) => {
        const overflowY = getComputedStyle(node).overflowY;
        return overflowY === "auto" || overflowY === "scroll";
      })
      .filter((node) => node.scrollHeight - node.clientHeight > 4)
      .map((node) => node.className?.toString() ?? node.tagName);
  });
  expect(innerScrollers).toEqual([]);

  const body = page.locator('[role="dialog"] .overflow-y-auto').first();
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  for (const label of CLAUDE_ROLE_LABELS) {
    await expect(dialog.getByRole("combobox", { name: new RegExp(`^${label}`) })).toBeVisible();
  }
});

test("清空旧预设的别名档位后，名字留在「已导入客户端仍在使用的模型名」里，预览同步", async ({
  page,
}) => {
  await setup(page);
  await openEditor(page);

  const dialog = page.getByRole("dialog");
  const preview = page.getByTestId("ccswitch-import-preview");
  await expect(preview).toContainText('"ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5"');

  await dialog.getByRole("combobox", { name: /^Haiku 默认模型/ }).click();
  await page.getByRole("option", { name: "跟随主模型" }).click();

  await expect(preview).not.toContainText("ANTHROPIC_DEFAULT_HAIKU_MODEL");
  const aliases = page.getByTestId("ccswitch-alias-list");
  await expect(aliases).toContainText("claude-haiku-4-5");
  await expect(aliases).toContainText("grok-4.5");
});

// #970: controls once rendered as bare text on the white dialog. Since the quiet-UI pass every
// control is a white field shaped by a shadow edge (shadow-control), so the edge is what
// keeps it from melting into the dialog.
test("浅色模式下输入控件有阴影描边，不与白色弹窗糊在一起", async ({ page }) => {
  await setup(page);
  await openEditor(page);

  const dialog = page.getByRole("dialog");
  for (const control of [
    dialog.getByRole("textbox", { name: /^名称/ }),
    dialog.getByRole("combobox", { name: /^渠道分组/ }),
    dialog.getByRole("combobox", { name: /^主模型/ }),
  ]) {
    const surface = await control.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, shadow: style.boxShadow };
    });
    expect(surface.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(surface.shadow).not.toBe("none");
  }
});

test("接入地址可一键复制", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await openEditor(page);

  const endpoint = page.getByTestId("ccswitch-config-endpoint-preview");
  const shown = (await endpoint.innerText()).trim();
  expect(shown).toMatch(/\/grok\/cs_grok01$/);

  const preview = page.getByTestId("ccswitch-import-preview");
  await preview.getByRole("button", { name: "复制" }).click();
  await expect(preview.getByRole("button", { name: "已复制" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
});

test("后端声明了 client-types 时，新建预设可选 OpenCode / OpenClaw / Hermes", async ({ page }) => {
  await setup(page, {
    clientTypes: ["claude", "codex", "gemini", "opencode", "openclaw", "hermes"],
  });
  await page.goto("/#/access/ccswitch-import-settings");
  await page.getByRole("button", { name: "新建配置" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab")).toHaveText([
    "Claude Code",
    "Codex",
    "Gemini CLI",
    "OpenCode",
    "OpenClaw",
    "Hermes",
  ]);
  await dialog.getByRole("tab", { name: "Hermes" }).click();
  // No group yet, so no route: the preview waits rather than showing a wrong endpoint.
  await expect(page.getByTestId("ccswitch-import-preview-pending")).toBeVisible();

  await dialog.getByRole("combobox", { name: /^渠道分组/ }).click();
  await page.getByRole("option", { name: /grok/ }).click();
  const preview = page.getByTestId("ccswitch-import-preview");
  await expect(preview).toContainText("~/.hermes/config.yaml");
  await expect(page.getByTestId("ccswitch-config-endpoint-preview")).toHaveText(
    /\/grok\/cs_[a-z0-9]+\/v1$/,
  );
});
