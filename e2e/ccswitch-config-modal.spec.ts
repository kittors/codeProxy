import { expect, test, type Page } from "@playwright/test";

/**
 * Regression cover for the CC Switch config modal.
 *
 * Two defects this locks down:
 *  - Light mode: the modal skinned every control with `bg-white` on top of a white card, so
 *    inputs/selects read as plain text. Controls must keep the shared filled surface.
 *  - The mapping table had a fixed inner height inside the scrollable modal body, which clipped
 *    the last Claude role behind a second, undiscoverable scroll area.
 */

const CONFIG = {
  id: "cfg-grok-claude",
  "client-type": "claude",
  "provider-name": "grok 版本的 claude code",
  note: "grok 版本的 claude code",
  "route-path": "/grok",
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

const setup = async (page: Page, { dark = false }: { dark?: boolean } = {}) => {
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
    route.fulfill(json({ "ccswitch-import-configs": [CONFIG] })),
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
  await page.route("**/v0/management/model-configs*", (route) => route.fulfill(json({ items: [] })));
  await page.route("**/v0/management/model-owner-presets*", (route) =>
    route.fulfill(json({ items: [] })),
  );
  await page.route("**/v0/management/config", (route) => route.fulfill(json({})));
  await page.route("**/v0/management/update/check*", (route) =>
    route.fulfill(json({ "update-available": false })),
  );
};

const openModal = async (page: Page) => {
  await page.goto("/#/access/ccswitch-import-settings");
  await page.getByRole("button", { name: "编辑配置" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("ccswitch-model-mapping-table")).toBeVisible();
};

test("每个 Claude 角色行都能直接看到，映射表不再嵌套第二层滚动", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await openModal(page);

  const table = page.getByTestId("ccswitch-model-mapping-table");
  // The table must grow with its rows: no vertical scrollport of its own.
  // (sr-only caption clips its own text with overflow:hidden — that is not a scroll area.)
  const innerScrollers = await table.evaluate((el) => {
    const nodes = [el, ...Array.from(el.querySelectorAll("*"))] as HTMLElement[];
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
    await expect(table.getByText(label, { exact: true })).toBeVisible();
  }
});

test("表格改为自然高度后，排序和行拖拽仍然可用", async ({ page }) => {
  await setup(page);
  await openModal(page);

  const table = page.getByTestId("ccswitch-model-mapping-table");
  await expect(table.locator("[data-vt-row-reorder-handle]").first()).toBeVisible();

  await table.getByRole("button", { name: /CC Switch 请求模型/ }).click();
  await page.getByRole("menuitem", { name: /升序/ }).click();

  const requestModels = await table
    .locator("tbody tr[data-vt-row-index] input")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(requestModels).toEqual([...requestModels].sort());
});

test("浅色模式下输入控件保持统一填充表面，不与白色卡片糊在一起", async ({ page }) => {
  await setup(page);
  await openModal(page);

  const providerInput = page.getByRole("dialog").getByLabel("供应商名称");
  const surfaces = await providerInput.evaluate((el) => {
    const control = getComputedStyle(el).backgroundColor;
    const card = getComputedStyle(el.closest("section") as HTMLElement).backgroundColor;
    return { control, card };
  });

  expect(surfaces.control).not.toBe(surfaces.card);
  expect(surfaces.control).not.toBe("rgba(0, 0, 0, 0)");
});

test("接入地址可一键复制", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await openModal(page);

  const preview = page.getByTestId("ccswitch-config-endpoint-preview");
  const shown = (await preview.innerText()).trim();
  expect(shown).toContain("/grok");

  await page.getByRole("dialog").getByRole("button", { name: "复制" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "已复制" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
});
