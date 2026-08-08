import { expect, test, type Page } from "@playwright/test";

// The providers tab body has overflow-hidden, which used to clip the card's
// ring away and leave the edge visibly broken. A border survives the clip.
const openProviders = async (page: Page) => {
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
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/config")) {
      return json({
        config: {
          "opencode-go": [
            { name: "opencode go", api_key: "sk-test", disabled: false, models: ["glm-5.2"] },
          ],
        },
      });
    }
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-providers");
};

test("provider list card renders a border, not a clipped ring", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openProviders(page);

  // Card always sets aria-busy; the notifications region does not.
  const card = page.locator("section[aria-busy]").first();
  await expect(card).toBeVisible();

  const style = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      borderTop: cs.borderTopWidth,
      borderLeft: cs.borderLeftWidth,
      borderBottom: cs.borderBottomWidth,
      borderRight: cs.borderRightWidth,
    };
  });

  // All four edges present and hairline-thin.
  for (const w of Object.values(style)) expect(w).toBe("1px");

  await page.screenshot({ path: "/tmp/providers-border.png" });
});
