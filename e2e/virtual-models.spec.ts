import { expect, test, type Page } from "@playwright/test";

/**
 * 模型页「虚拟模型」标签，在真实浏览器里：列表、编辑器（选模型、手填模型、分组、按权重、键盘调顺序）、
 * 保存时带上读到的版本；角色没有 routing.write 时只读；后端不声明支持时没有这个标签。接口全部 mock。
 */

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

const smart = {
  name: "smart",
  description: "先用 GPT，忙时换 Claude",
  members: [{ group: "team", model: "gpt-5" }, { model: "claude-opus-4" }],
};

interface Backend {
  /** 每次 PUT 的请求体。 */
  puts: Array<{ "virtual-models": unknown[]; version: number }>;
}

async function openModels(
  page: Page,
  { permissions, virtualModels = true }: { permissions: string[]; virtualModels?: boolean },
): Promise<Backend> {
  const backend: Backend = { puts: [] };
  let list: unknown[] = [smart];
  let version = 3;

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
            display_name: "Administrator",
            status: "active",
            must_change_password: false,
            last_login_at: null,
            role_ids: ["r-admin"],
            role_codes: ["tenant_admin"],
            version: 1,
            created_at: "",
            updated_at: "",
          },
          home_tenant: tenant,
          effective_tenant: tenant,
          roles: [],
          permissions,
          platform_admin: false,
        },
      }),
    }),
  );

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/v0\/management/, "");
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/routing-config") {
      return json({
        strategy: "round-robin",
        "channel-groups": [{ name: "team" }, { name: "backup" }],
        "virtual-models": list,
        capabilities: virtualModels ? { "virtual-models": true } : {},
      });
    }
    if (path === "/routing-config/virtual-models") {
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as Backend["puts"][number];
        backend.puts.push(body);
        if (body.version !== version) {
          return json({ error: { code: "config_version_conflict", message: "stale" } }, 409);
        }
        list = body["virtual-models"];
        version += 1;
        return json({ status: "ok" });
      }
      return json({ "virtual-models": list, version });
    }
    if (path === "/channel-groups") return json({ items: [{ name: "team" }, { name: "backup" }] });
    if (path === "/models") {
      return json({ data: [{ id: "gpt-5" }, { id: "gpt-5-mini" }, { id: "claude-opus-4" }] });
    }
    if (path.startsWith("/model-configs")) return json({ data: [] });
    return json({});
  });

  await page.goto("/#/models");
  return backend;
}

for (const width of [1280, 1470]) {
  test(`adds a weighted virtual model in a ${width}×720 window`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    const backend = await openModels(page, {
      permissions: ["models.read", "models.write", "routing.read", "routing.write"],
    });

    await page.getByRole("tab", { name: "虚拟模型" }).click();
    const row = page.getByRole("row").filter({ hasText: "smart" });
    await expect(row).toContainText("team/gpt-5");
    await expect(row).toContainText("claude-opus-4");
    await expect(row).toContainText("按顺序");

    await page.getByRole("button", { name: "新增虚拟模型" }).first().click();
    const dialog = page.getByRole("dialog", { name: "新增虚拟模型" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: /名称/ }).fill("fast");

    await dialog.getByRole("combobox", { name: "第 1 个成员的模型" }).click();
    await page
      .getByRole("listbox", { name: "第 1 个成员的模型" })
      .getByRole("option", { name: "gpt-5-mini", exact: true })
      .click();

    await dialog.getByRole("button", { name: "添加成员" }).click();
    await dialog.getByRole("combobox", { name: "第 2 个成员的渠道分组" }).click();
    await page
      .getByRole("listbox", { name: "第 2 个成员的渠道分组" })
      .getByRole("option", { name: "backup", exact: true })
      .click();
    // 模型列表里没有的模型可以手填。
    await dialog.getByRole("combobox", { name: "第 2 个成员的模型" }).click();
    await page.getByPlaceholder("搜索模型").fill("my-own-model");
    await page.getByRole("option", { name: "使用 my-own-model" }).click();

    await dialog.getByRole("radio", { name: "按权重" }).click();
    await dialog.getByRole("textbox", { name: "第 1 个成员的权重" }).fill("3");
    await dialog.getByRole("textbox", { name: "第 2 个成员的权重" }).fill("1");
    await expect(dialog.getByText("约 75% 先试它")).toBeVisible();
    await expect(dialog.getByText("约 25% 先试它")).toBeVisible();

    // 成员顺序就是尝试顺序：手柄上按方向键也能调。
    await dialog.getByRole("button", { name: "拖拽调整第 2 行位置" }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(dialog.getByRole("combobox", { name: "第 1 个成员的模型" })).toHaveText(
      "my-own-model",
    );

    // 弹窗在窗口里，成员表格不比弹窗宽。
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const overflow = await dialog.getByRole("table").evaluate((table) => {
      const scroller = table.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) });

    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("虚拟模型已保存")).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(backend.puts).toEqual([
      {
        version: 3,
        "virtual-models": [
          smart,
          {
            name: "fast",
            strategy: "weighted",
            members: [
              { group: "backup", model: "my-own-model", weight: 1 },
              { model: "gpt-5-mini", weight: 3 },
            ],
          },
        ],
      },
    ]);
    const added = page.getByRole("row").filter({ hasText: "fast" });
    await expect(added).toContainText("backup/my-own-model");
    await expect(added).toContainText("按权重");
    // 表头文字没有被截成省略号。
    const clipped = await page
      .getByRole("columnheader", { name: /第一个成员/ })
      .evaluate((cell) =>
        [...cell.querySelectorAll("*")].some(
          (el) =>
            getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth,
        ),
      );
    expect(clipped).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`) });
  });
}

test("a role that may only read routing sees the list without edit controls", async ({ page }) => {
  await openModels(page, { permissions: ["models.read", "routing.read"] });
  await page.getByRole("tab", { name: "虚拟模型" }).click();
  await expect(page.getByRole("row").filter({ hasText: "smart" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增虚拟模型" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑 smart" })).toHaveCount(0);
});

test("an older backend shows no virtual models tab", async ({ page }) => {
  await openModels(page, {
    permissions: ["models.read", "routing.read", "routing.write"],
    virtualModels: false,
  });
  await expect(page.getByRole("tab", { name: "当前模型" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "虚拟模型" })).toHaveCount(0);
});
