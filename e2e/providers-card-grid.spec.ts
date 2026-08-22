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
      // Only the first OpenCode Go credential has traffic; the codex ones have
      // none, which is what the empty-state case below relies on.
      return fulfillJson({
        source: [
          {
            entity_name: "sk-opencode-go-alpha-1234567890abcdef",
            requests: 5864,
            failed: 98,
          },
        ],
        auth_index: [],
      });
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
 * key and a base URL, another badges, chips and three quota bars. Letting each
 * end at its own content does not remove empty space, it moves it: the row is
 * still as tall as its tallest card, so a short card leaves a gap between its
 * bottom edge and the next row. Levelling keeps that space inside the card,
 * where it reads as padding, and the rows stay flush.
 */
test("AI Providers: every card in a row ends on the same line", async ({
  page,
}) => {
  await setAuthed(page, "codex");
  await mockManagementApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/#/access/ai-providers");

  const list = page.getByTestId("providers-tab-scroll");
  await expect(list).toBeVisible();
  await expect.poll(() => list.locator("> *").count()).toBe(codexKeys.length);

  const rows = await list.evaluate((el) => {
    const byTop = new Map<number, number[]>();
    for (const child of el.children) {
      const rect = child.getBoundingClientRect();
      const top = Math.round(rect.top);
      byTop.set(top, [...(byTop.get(top) ?? []), Math.round(rect.bottom)]);
    }
    return [...byTop.entries()].map(([top, bottoms]) => ({
      top,
      raggedBy: Math.max(...bottoms) - Math.min(...bottoms),
    }));
  });

  expect(rows.length, "the fixture should produce at least one row").toBeGreaterThan(0);
  for (const row of rows) {
    expect(
      row.raggedBy,
      `cards in the row at y=${row.top} must end level`,
    ).toBeLessThanOrEqual(1);
  }

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
  await expect(list.getByTestId("provider-success-rate")).toHaveCount(0);
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

/**
 * With traffic, the rate is a labelled bar like the quota windows above it. It
 * used to be a strip of ~21 blocks in a footer sized to its content — about 95px
 * wide, so each block was 4px and only the percentage was readable.
 */
test("AI Providers: a channel with traffic shows a full-width success-rate bar", async ({
  page,
}) => {
  await setAuthed(page, "opencode-go");
  await mockManagementApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/#/access/ai-providers");

  const list = page.getByTestId("providers-tab-scroll");
  await expect(list).toBeVisible();

  const bar = list.getByTestId("provider-success-rate").first();
  await expect(bar).toBeVisible();

  const metrics = await bar.evaluate((el) => {
    const card = el.closest(".group");
    return {
      width: Math.round(el.getBoundingClientRect().width),
      cardWidth: Math.round((card as HTMLElement).getBoundingClientRect().width),
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });

  expect(
    metrics.width,
    "the bar should span the card, not shrink to its content",
  ).toBeGreaterThan(metrics.cardWidth * 0.7);
  expect(metrics.text, "the bar labels itself and reports the rate").toMatch(/%$/);
});
