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

test("AI Providers (OpenAI): typing provider name should not crash page", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err);
  });
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await setAuthed(page);

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

    if (url.endsWith("/v0/management/usage")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ apis: {} }),
      });
      return;
    }

    if (url.endsWith("/v0/management/openai-compatibility")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ "openai-compatibility": [] }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/ai-providers");

  await page.getByRole("button", { name: /openai compatible|openai 兼容/i }).click();

  await page.getByRole("button", { name: /add provider|添加/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const nameInput = dialog.getByRole("textbox").first();

  await nameInput.fill("openrouter");
  await page.waitForTimeout(200);

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    const detail = [
      pageErrors.length
        ? `pageerror: ${pageErrors.map((e) => `${e.message}\n${e.stack ?? ""}`).join("\n---\n")}`
        : null,
      consoleErrors.length ? `console.error: ${consoleErrors.join(" | ")}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(detail);
  }

  await expect(dialog).toBeVisible();
  await expect(nameInput).toHaveValue("openrouter");

  expect(pageErrors).toEqual([]);
});
