import { expect, test, type Page } from "@playwright/test";

// The providers tab body has overflow-hidden, which used to clip the card's
// ring away and leave the edge visibly broken. The edge is now an inset shadow
// on the card's own ::after (the `.cp-edge` hairline): it is painted inside the
// card, so no ancestor can clip it, and the card itself draws no border.
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
    localStorage.setItem("providers-page:tab", "openai");
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/openai-compatibility")) {
      return json({
        "openai-compatibility": [
          {
            name: "OpenAI Compatible",
            "base-url": "https://example.com/v1",
            models: [{ name: "gpt-4.1" }],
            "api-key-entries": [{ "api-key": "sk-test" }],
          },
        ],
      });
    }
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-providers");
};

test("provider list card draws its Satin 1px hairline border inside border-box without clipping", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openProviders(page);

  const card = page.locator("section.group\\/card").first();
  await expect(card).toBeVisible();

  const style = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      boxSizing: cs.boxSizing,
      borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      borderStyle: cs.borderTopStyle,
      boxShadow: cs.boxShadow,
    };
  });

  // Satin 原生 .sn-panel 卡片：1px 实线边框画在 border-box 内部，永不被祖先 overflow-hidden 裁剪，无外扩脏阴影。
  expect(style.boxSizing).toBe("border-box");
  for (const w of style.borders) expect(w).toBe("1px");
  expect(style.borderStyle).toBe("solid");
  expect(style.boxShadow).toBe("none");

  await page.screenshot({ path: "/tmp/providers-border.png" });
});
