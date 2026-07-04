import { expect, test, type Page } from "@playwright/test";

const LOOKUP_SESSION_KEY = "apiKeyLookup.lastApiKey.v1";
const TEST_API_KEY = "sk-e2e-lookup-quick-import";

const setQueriedLookupKey = async (page: Page) => {
  // Pre-seed sessionStorage so the lookup page mounts with a queried key and
  // renders the results toolbar + tabs (including quickImport) without
  // requiring a click through the search form.
  await page.addInitScript((key) => {
    try {
      window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", key);
    } catch {
      // ignore
    }
  }, TEST_API_KEY);
};

const mockLookupApisForQuickImport = async (page: Page) => {
  await page.route("**/v0/management/public/usage/logs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });

  await page.route("**/v0/management/public/usage/chart-data", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model_distribution: [],
        daily_trend: [],
        stat: { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 },
      }),
    });
  });

  await page.route("**/v0/management/public/ccswitch-import-configs", async (route) => {
    const preset = {
      id: "codex-pro-quick-import",
      "client-type": "codex",
      "provider-name": "Pro 池+codex",
      note: "Pro pool codex card",
      "default-model": "gpt-5.5",
      "model-mappings": [
        { "request-model": "gpt-5.5", "target-model": "gpt-5.5" },
        { "request-model": "deepseek-v4-flash", "target-model": "deepseek-chat" },
      ],
      "allowed-channel-groups": ["pro"],
      "route-path": "/pro/cs_lookup",
      "endpoint-path": "/v1",
      "usage-auto-interval": 30,
      "codex-model-catalog-filename": "cc-switch-model-catalog.json",
      "codex-model-catalog": {
        models: [
          {
            slug: "gpt-5.5",
            model: "gpt-5.5",
            default_reasoning_level: "medium",
            supported_reasoning_levels: [
              { effort: "low", description: "Fast" },
              { effort: "medium", description: "Balanced" },
              { effort: "high", description: "Deep" },
              { effort: "xhigh", description: "Extra deep" },
            ],
          },
          {
            slug: "deepseek-v4-flash",
            model: "deepseek-v4-flash",
            default_reasoning_level: "high",
            supported_reasoning_levels: [
              { effort: "low" },
              { effort: "medium" },
              { effort: "high" },
              { effort: "xhigh" },
            ],
          },
        ],
      },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        "ccswitch-import-configs": [preset],
        api_key: TEST_API_KEY,
        api_key_masked: "sk-...-port",
        found: true,
      }),
    });
  });

  await page.route("**/v1/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "gpt-5.5" }, { id: "deepseek-v4-flash" }],
      }),
    });
  });
};

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const latestSundayDateKey = () => {
  const date = new Date();
  date.setDate(date.getDate() - date.getDay());
  return localDateKey(date);
};

const mockLookupApisForHeatmap = async (page: Page, date: string) => {
  await page.route("**/v0/management/public/usage/chart-data", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        daily_series: [],
        heatmap_series: [
          {
            date,
            requests: 382,
            sessions: 8,
            tokens: 26890848,
            cost: 36.5432,
          },
        ],
        model_distribution: [],
        api_key_name: "Heatmap key",
        stats: {
          total: 382,
          success_rate: 100,
          total_tokens: 26890848,
          total_sessions: 8,
          total_cost: 36.5432,
        },
      }),
    });
  });
};

const decodeCodexConfigBlob = (url: string) => {
  const encoded = new URL(url).searchParams.get("config");
  if (!encoded) throw new Error("missing config param");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes)) as {
    auth: { OPENAI_API_KEY?: string };
    config: string;
    apiFormat?: string;
    modelCatalog?: { models: Array<Record<string, unknown>> };
  };
};

test("API Key Lookup: Heatmap tooltip stays inside the heatmap card when hovering the top row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await setQueriedLookupKey(page);
  const date = latestSundayDateKey();
  await mockLookupApisForHeatmap(page, date);

  await page.goto("/#/apikey-lookup");

  const heatmapCard = page
    .getByRole("heading", { name: /Request Heatmap|请求热力图/i })
    .locator("xpath=ancestor::section[1]");
  await expect(heatmapCard).toBeVisible();

  await page.locator(`[aria-label^="${date}: 382 "]`).hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();

  const positions = await Promise.all([heatmapCard.boundingBox(), tooltip.boundingBox()]);
  const [cardBox, tooltipBox] = positions;
  expect(cardBox).not.toBeNull();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
});

test("API Key Lookup: Quick Import codex card opens a ccswitch deep link with embedded catalog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setQueriedLookupKey(page);
  await mockLookupApisForQuickImport(page);

  await page.addInitScript(() => {
    window.open = (url?: string | URL) => {
      if (typeof url === "string") {
        (window as unknown as { __ccswitchOpenedUrl?: string[] }).__ccswitchOpenedUrl =
          (window as unknown as { __ccswitchOpenedUrl?: string }).__ccswitchOpenedUrl ?? [];
        (window as unknown as { __ccswitchOpenedUrl?: string[] }).__ccswitchOpenedUrl!.push(url);
      }
      return null;
    };
  });

  await page.goto("/#/apikey-lookup");

  // Switch to the quickImport tab. The tab is labeled with an i18n key that
  // renders as "快速导入" / "Quick Import" depending on the UI locale.
  const quickImportTab = page.getByRole("tab", { name: /快速导入|Quick Import/i });
  await expect(quickImportTab).toBeVisible();
  await quickImportTab.click();

  // The codex preset card uses the provider name as the visible button text.
  const cardButton = page.getByRole("button", { name: /Pro 池\+codex/ });
  await expect(cardButton).toBeVisible();

  await cardButton.click();

  const openedUrl = await page.evaluate(() => {
    const list = (window as unknown as { __ccswitchOpenedUrl?: string[] }).__ccswitchOpenedUrl;
    return list?.[0];
  });
  expect(openedUrl).toBeTruthy();
  expect(openedUrl!.startsWith("ccswitch://v1/import?")).toBe(true);

  const parsed = new URL(openedUrl!);
  expect(parsed.searchParams.get("app")).toBe("codex");
  expect(parsed.searchParams.get("apiFormat")).toBe("openai_responses");

  const decoded = decodeCodexConfigBlob(openedUrl!);
  expect(decoded.apiFormat).toBe("openai_responses");
  expect(decoded.auth.OPENAI_API_KEY).toBe(TEST_API_KEY);
  expect(decoded.modelCatalog?.models).toBeTruthy();
  expect(decoded.modelCatalog!.models.length).toBe(2);
  expect(decoded.modelCatalog!.models[0]).toMatchObject({
    slug: "gpt-5.5",
    default_reasoning_level: "medium",
  });
  // Catalog default for the selected model (gpt-5.5) is medium, so the
  // generated config.toml should use model_reasoning_effort = "medium".
  expect(decoded.config).toContain(`model_reasoning_effort = "medium"`);
  expect(decoded.config).toContain(`model_catalog_json = "cc-switch-model-catalog.json"`);
});

test("API Key Lookup: Quick Import copy button surfaces the ccswitch link via clipboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setQueriedLookupKey(page);
  await mockLookupApisForQuickImport(page);

  await page.goto("/#/apikey-lookup");
  // Grant clipboard read+write permissions for the running dev origin so
  // copyTextToClipboard succeeds and we can read the copied link back to
  // assert its payload.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });

  const quickImportTab = page.getByRole("tab", { name: /快速导入|Quick Import/i });
  await expect(quickImportTab).toBeVisible();
  await quickImportTab.click();

  const cardButton = page.getByRole("button", { name: /Pro 池\+codex/ });
  await expect(cardButton).toBeVisible();

  // The copy button is the ghost action next to each import card. We target
  // it via its accessible name, which is the "ccswitch.copy_import_link"
  // tooltip/title string. The card body's accessible name is the provider
  // name, so the copy button is uniquely identified by the copy label.
  const copyButton = page.getByRole("button", { name: /Copy import link|复制导入链接/i });
  await expect(copyButton).toBeVisible();
  await copyButton.first().click();

  // The copy button flips to a "copied" state immediately, then resets after
  // ~1.8s. We assert the pressed-state visual: the title becomes
  // "Import link copied" / "导入链接已复制". If the clipboard write failed,
  // the button would not flip and the assertion fails.
  const copiedButton = page.getByRole("button", { name: /Import link copied|导入链接已复制/i });
  await expect(copiedButton).toBeVisible({ timeout: 1500 });

  // Verify the clipboard content matches a ccswitch:// deep link with the
  // catalog payload intact.
  const clipText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipText.startsWith("ccswitch://v1/import?")).toBe(true);
  const clipParsed = new URL(clipText);
  expect(clipParsed.searchParams.get("app")).toBe("codex");
  const clipDecoded = decodeCodexConfigBlob(clipText);
  expect(clipDecoded.modelCatalog?.models.length).toBe(2);
  expect(clipDecoded.modelCatalog!.models[0]).toMatchObject({
    slug: "gpt-5.5",
    default_reasoning_level: "medium",
  });
});
