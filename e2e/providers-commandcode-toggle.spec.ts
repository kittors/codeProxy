import { expect, test, type Page } from "@playwright/test";

// CommandCode keys carry an explicit `disabled` field and the card reads that
// field, but the toggle used to write an exclude-all model rule instead. The
// switch flipped back on every render and the account could never be re-enabled
// from the list.
const openCommandCodeTab = async (page: Page, overrides: { disabled?: boolean } = {}) => {
  const entry = {
    id: "cc-1",
    "api-key": "cc-secret",
    name: "CommandCode A",
    "base-url": "https://api.commandcode.ai/provider/v1",
    disabled: overrides.disabled ?? false,
    models: [{ name: "gpt-5.3-codex" }],
  };
  const patched: { index: number; value: Record<string, unknown> }[] = [];

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
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
    localStorage.setItem("providers-page:tab", "commandcode");
  });
  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/commandcode-api-key")) {
      if (request.method() === "PATCH") {
        const body = JSON.parse(request.postData() ?? "{}") as {
          index: number;
          value: Record<string, unknown>;
        };
        patched.push(body);
        if (typeof body.value?.disabled === "boolean") {
          entry.disabled = body.value.disabled;
        }
        return json({ status: "ok" });
      }
      return json({ "commandcode-api-key": [entry] });
    }
    if (path.endsWith("/commandcode-api-key/usage")) return json({ usage: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-providers");
  return { entry, patched };
};

test("commandcode card toggle switches the account off and back on", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { entry, patched } = await openCommandCodeTab(page);

  await expect(page.getByText("CommandCode A")).toBeVisible();
  const toggle = page.getByRole("button", { name: /^(启用|禁用)$/ }).first();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect.poll(() => entry.disabled).toBe(true);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect.poll(() => entry.disabled).toBe(false);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // The switch must drive the disabled flag, never the exclude-all model rule:
  // writing "*" here silently wipes the key's model access.
  expect(patched.map((item) => item.value.disabled)).toEqual([true, false]);
  for (const item of patched) {
    expect(item.value["excluded-models"] ?? []).not.toContain("*");
  }
});

test("commandcode editor reflects and writes the disabled flag", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { entry, patched } = await openCommandCodeTab(page, { disabled: true });

  await expect(page.getByText("CommandCode A")).toBeVisible();
  await page.getByRole("button", { name: "更多操作" }).first().click();
  await page.getByRole("menuitem", { name: "编辑" }).click();

  // The editor switch has to read the same field the card does.
  const editorToggle = page.getByRole("switch", { name: "启用" }).first();
  await expect(editorToggle).toHaveAttribute("aria-checked", "false");

  await editorToggle.click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect.poll(() => entry.disabled).toBe(false);
  expect(patched.at(-1)?.value.disabled).toBe(false);
});
