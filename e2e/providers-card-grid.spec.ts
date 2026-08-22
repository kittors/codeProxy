import { expect, test, type Page } from "@playwright/test";

/**
 * The provider card grid is a flex child with a resolved height. Without
 * `content-start` the single row absorbs all of it and every card is stretched
 * to the full height of the scroll box; without matching width rules the card's
 * own `md:max-w-none` beats any narrower cap a caller passes and the card goes
 * full bleed. Both shipped together once and left one giant card per tab.
 */

const codexKeys = [
  {
    "api-key": "sk-codex-alpha-1234567890abcdef",
    name: "codex one",
    "base-url": "https://chatgpt.com/backend-api/codex",
  },
  // Deliberately taller than the first: it adds a badge row and a chip row, so
  // the two cards must not come out the same height.
  {
    "api-key": "sk-codex-beta-1234567890abcdef",
    name: "codex two",
    models: [{ name: "gpt-5.2" }, { name: "gpt-5.3-codex" }],
  },
];

const opencodeGoKeys = [
  {
    "api-key": "sk-opencode-go-alpha-1234567890abcdef",
    name: "opencode go",
    "workspace-id": "wrk_alpha",
    "auth-cookie": "auth=alpha",
  },
  {
    "api-key": "sk-opencode-go-beta-abcdef1234567890",
    name: "opencode go two",
    "workspace-id": "wrk_beta",
    "auth-cookie": "auth=beta",
  },
];

const openaiProviders = [
  {
    name: "OpenAI Main",
    "base-url": "https://api.openai.com/v1",
    "api-key-entries": [{ "api-key": "sk-openai-main-1234567890" }],
    models: [{ name: "gpt-4.1" }],
  },
  {
    name: "OpenAI Backup",
    "base-url": "https://backup.example.com/v1",
    "api-key-entries": [{ "api-key": "sk-openai-backup-1234567890" }],
    models: [{ name: "gpt-4.1-mini" }],
  },
];

const setAuthed = async (page: Page, tab: string) => {
  await page.addInitScript((activeTab) => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("providers-page:tab", activeTab);
  }, tab);
};

const mockManagementApi = async (page: Page) => {
  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const managementPath = url.pathname.replace("/v0/management", "") || "/";
    const fulfillJson = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (managementPath === "/config") return fulfillJson({});
    if (managementPath === "/proxy-pool") return fulfillJson({ items: [] });
    if (managementPath.startsWith("/usage/entity-stats"))
      return fulfillJson({ source: [], auth_index: [] });
    if (managementPath === "/codex-api-key" && request.method() === "GET")
      return fulfillJson({ "codex-api-key": codexKeys });
    if (managementPath === "/opencode-go-api-key" && request.method() === "GET")
      return fulfillJson({ "opencode-go-api-key": opencodeGoKeys });
    if (managementPath === "/openai-compatibility" && request.method() === "GET")
      return fulfillJson({ "openai-compatibility": openaiProviders });
    if (managementPath === "/opencode-go-api-key/usage")
      return fulfillJson({
        workspace_id: "wrk",
        usage: [
          { type: "rolling", label: "Rolling", percentage: 3 },
          { type: "weekly", label: "Weekly", percentage: 62 },
          { type: "monthly", label: "Monthly", percentage: 98 },
        ],
      });
    if (managementPath.startsWith("/model-definitions/"))
      return fulfillJson({ models: [] });
    return fulfillJson({});
  });
};

const readGridMetrics = (page: Page) =>
  page.getByTestId("providers-tab-scroll").evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      containerWidth: Math.round(el.clientWidth),
      containerHeight: Math.round(el.clientHeight),
      display: style.display,
      alignContent: style.alignContent,
      alignItems: style.alignItems,
      columnCount: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      cards: Array.from(el.children).map((child) => {
        const rect = child.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    };
  });

for (const tabCase of [
  { tab: "codex", label: "Codex", expected: codexKeys.length },
  {
    tab: "opencode-go",
    label: "OpenCode Go",
    expected: opencodeGoKeys.length,
  },
  { tab: "openai", label: "OpenAI-compatible", expected: openaiProviders.length },
]) {
  test(`AI Providers: ${tabCase.label} cards size to their content, not the scroll box`, async ({
    page,
  }) => {
    await setAuthed(page, tabCase.tab);
    await mockManagementApi(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/#/access/ai-providers");

    const list = page.getByTestId("providers-tab-scroll");
    await expect(list).toBeVisible();
    await expect.poll(() => list.locator("> *").count()).toBe(tabCase.expected);

    const metrics = await readGridMetrics(page);

    expect(metrics.display, "cards must be laid out on a grid").toBe("grid");
    expect(metrics.columnCount, "wide viewports show three columns").toBe(3);

    for (const [index, card] of metrics.cards.entries()) {
      expect(
        card.width,
        `card ${index} must stay inside its column, not span the row`,
      ).toBeLessThan(metrics.containerWidth / 2);
      expect(
        card.height,
        `card ${index} must be content height, not the full scroll box`,
      ).toBeLessThan(metrics.containerHeight / 2);
      expect(card.height, `card ${index} must still be a card`).toBeGreaterThan(
        60,
      );
    }
  });
}

/**
 * Provider cards carry wildly different amounts of content — one may hold just a
 * key and a base URL, another badges, chips and three quota bars. Levelling a
 * row padded the short ones out to the tallest, which is where the dead space
 * under most cards came from.
 */
test("AI Providers: cards end where their content ends, not level with the row", async ({
  page,
}) => {
  await setAuthed(page, "codex");
  await mockManagementApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/#/access/ai-providers");

  const list = page.getByTestId("providers-tab-scroll");
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator("> *").count()).toBe(codexKeys.length);

  const metrics = await readGridMetrics(page);
  expect(metrics.alignItems, "the grid must not stretch its items").toMatch(
    /start$/,
  );
  const [shorter, taller] = metrics.cards;
  expect(
    taller.height,
    "the card with badges and chips must be the taller one",
  ).toBeGreaterThan(shorter.height);

  // And no card carries slack: its scroll height is its rendered height.
  const overflow = await list.evaluate((el) =>
    [...el.children].map((c) => c.scrollHeight - c.clientHeight),
  );
  for (const [index, slack] of overflow.entries()) {
    expect(slack, `card ${index} should have no hidden overflow`).toBeLessThanOrEqual(1);
  }
});

test("AI Providers: one column on mobile keeps cards inside the viewport", async ({
  page,
}) => {
  await setAuthed(page, "codex");
  await mockManagementApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/access/ai-providers");

  const list = page.getByTestId("providers-tab-scroll");
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator("> *").count()).toBe(codexKeys.length);

  const metrics = await readGridMetrics(page);
  expect(metrics.columnCount).toBe(1);
  for (const card of metrics.cards) {
    expect(card.width).toBeLessThanOrEqual(metrics.containerWidth);
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(false);
});

/**
 * An unused channel used to end in a row of ~20 grey blocks and a "--" success
 * rate, sitting under a divider — the loudest band on the card, reporting
 * nothing. Zero-valued metric badges said the same thing a second time.
 */
test("AI Providers: a channel with no traffic shows no status bar, rate or zero badges", async ({
  page,
}) => {
  await setAuthed(page, "codex");
  await mockManagementApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/#/access/ai-providers");

  const list = page.getByTestId("providers-tab-scroll");
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator("> *").count()).toBe(codexKeys.length);

  // No usage stats are mocked, so neither codex channel has traffic.
  await expect(list.getByRole("status")).toHaveCount(0);
  await expect(list).not.toContainText("--");
  await expect(list).not.toContainText("Success 0");
  await expect(list).not.toContainText("Failed 0");
  await expect(list).not.toContainText("Models 0");

  // A rule is a top border with no bottom border. Boxes (the card itself, a
  // quota bar) have all four, so they are not caught by this.
  const dividerCount = await list.evaluate(
    (el) =>
      [...el.querySelectorAll("*")].filter((node) => {
        const style = getComputedStyle(node);
        return (
          parseFloat(style.borderTopWidth) > 0 &&
          style.borderTopStyle !== "none" &&
          parseFloat(style.borderBottomWidth) === 0
        );
      }).length,
  );
  expect(dividerCount, "cards should carry no internal rules").toBe(0);
});
