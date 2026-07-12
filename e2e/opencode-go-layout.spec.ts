import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const opencodeGoKeys = [
  {
    "api-key": "sk-opencode-go-alpha-1234567890abcdef",
    name: "OC usage nearly full",
    prefix: "oc-alpha",
    "workspace-id": "wrk_alpha",
    "auth-cookie": "auth=alpha",
  },
  {
    "api-key": "sk-opencode-go-beta-abcdef1234567890",
    name: "OC weekly half",
    prefix: "oc-beta",
    "workspace-id": "wrk_beta",
    "auth-cookie": "auth=beta",
  },
  {
    "api-key":
      "sk-opencode-go-gamma-verylongkey-1234567890abcdef1234567890abcdef",
    name: "opencode-go-very-long-provider-name-that-should-truncate-cleanly",
    prefix: "oc-gamma-long-prefix-value",
    "workspace-id": "wrk_gamma",
    "auth-cookie": "auth=gamma",
  },
  {
    "api-key": "sk-opencode-go-no-dashboard-1234567890abcdef",
    name: "No dashboard credentials",
    prefix: "oc-no-usage",
  },
  {
    "api-key": "sk-opencode-go-low-remaining-1234567890abcdef",
    name: "Low remaining",
    prefix: "oc-low",
    "workspace-id": "wrk_low",
    "auth-cookie": "auth=low",
  },
  {
    "api-key": "sk-opencode-go-unused-1234567890abcdef",
    name: "Fresh unused key",
    prefix: "oc-unused",
  },
];

const clineKeys = [
  {
    "api-key": "sk-cline-secret-1234567890",
    name: "Cline usage card",
    prefix: "cline-one",
    "base-url": "https://api.cline.bot/api/v1",
    "auth-cookie": "auth=cline",
  },
];

const ollamaCloudKeys = [
  {
    "api-key": "sk-ollama-secret-0987654321",
    name: "Ollama usage card",
    prefix: "ollama-one",
    "base-url": "https://ollama.com",
    "auth-cookie": "auth=ollama",
  },
];

const providerUsageKeys = [...opencodeGoKeys, ...clineKeys, ...ollamaCloudKeys];

const usageStats = providerUsageKeys.map((item, index) => ({
  entity_name: item["api-key"],
  requests: [5524, 4872, 3105, 0, 3381, 0, 120, 96][index] ?? 0,
  failed: [279, 209, 78, 0, 163, 0, 4, 2][index] ?? 0,
  avg_latency: 320,
  total_tokens: 1000,
}));

const opencodeGoUsage = [
  { type: "rolling", label: "Rolling", percentage: 4, resets_in: "31 minutes" },
  { type: "weekly", label: "Weekly", percentage: 47, resets_in: "4 days" },
  { type: "monthly", label: "Monthly", percentage: 96.8, resets_in: "12 days" },
];

const clineUsage = [
  { type: "five_hour", label: "5h", percentage: 18, resets_in: "2 hours" },
  { type: "weekly", label: "Weekly", percentage: 41, resets_in: "4 days" },
  { type: "monthly", label: "Monthly", percentage: 62, resets_in: "12 days" },
];

const ollamaCloudUsage = [
  {
    type: "rolling",
    label: "Rolling",
    percentage: 11,
    resets_in: "48 minutes",
  },
  { type: "weekly", label: "Weekly", percentage: 34, resets_in: "5 days" },
];

const modelDefinitions = {
  "opencode-go": [{ id: "opencode/gpt-5.2" }],
  cline: [{ id: "cline-pass/deepseek-v4" }],
  "ollama-cloud": [{ id: "gpt-oss:120b" }],
} as const;

const testedViewports = [
  { name: "desktop-narrow", width: 1280, height: 720 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-narrow", width: 360, height: 740 },
] as const;

const setAuthed = async (page: Page) => {
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
    localStorage.setItem("providers-page:tab", "opencode-go");
  });
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
    if (managementPath.startsWith("/usage/entity-stats")) {
      return fulfillJson({ source: usageStats, auth_index: [] });
    }
    if (
      managementPath === "/opencode-go-api-key" &&
      request.method() === "GET"
    ) {
      return fulfillJson({ "opencode-go-api-key": opencodeGoKeys });
    }
    if (managementPath === "/cline-api-key" && request.method() === "GET") {
      return fulfillJson({ "cline-api-key": clineKeys });
    }
    if (
      managementPath === "/ollama-cloud-api-key" &&
      request.method() === "GET"
    ) {
      return fulfillJson({ "ollama-cloud-api-key": ollamaCloudKeys });
    }
    if (
      managementPath === "/opencode-go-api-key/usage" &&
      request.method() === "POST"
    ) {
      return fulfillJson({ workspace_id: "wrk_test", usage: opencodeGoUsage });
    }
    if (
      managementPath === "/cline-api-key/usage" &&
      request.method() === "POST"
    ) {
      return fulfillJson({ usage: clineUsage });
    }
    if (
      managementPath === "/ollama-cloud-api-key/usage" &&
      request.method() === "POST"
    ) {
      return fulfillJson({ usage: ollamaCloudUsage });
    }
    if (managementPath.startsWith("/model-definitions/")) {
      const channel = decodeURIComponent(managementPath.split("/").pop() ?? "");
      return fulfillJson({
        models:
          modelDefinitions[channel as keyof typeof modelDefinitions] ?? [],
      });
    }
    return fulfillJson({});
  });
};

const getTitleLeftOffset = async (page: Page, title: string) =>
  page.getByText(title, { exact: true }).evaluate((titleElement) => {
    const card = titleElement.closest(".group");
    if (!card) throw new Error(`No provider card found for ${title}`);
    const cardRect = card.getBoundingClientRect();
    const titleRect = titleElement.getBoundingClientRect();
    return Math.round(titleRect.left - cardRect.left);
  });

test("AI Providers: OpenCode Go cards should not overlap on responsive layouts", async ({
  page,
}) => {
  await setAuthed(page);
  await mockManagementApi(page);

  for (const viewport of testedViewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/#/access/ai-providers");

    const list = page.getByTestId("providers-tab-scroll");
    await expect(list).toBeVisible();
    await expect
      .poll(() => list.locator("> *").count())
      .toBe(opencodeGoKeys.length);
    await expect.poll(() => list.textContent()).toContain("3.2%");
    if (viewport.width <= 767) {
      await expect
        .poll(() => list.evaluate((el) => el.clientWidth))
        .toBeGreaterThan(200);
    }

    const metrics = await list.evaluate((el) => {
      const cards = Array.from(el.children).map((child, index) => {
        const rect = child.getBoundingClientRect();
        return {
          index,
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      });

      const overlaps: Array<{ a: number; b: number; x: number; y: number }> =
        [];
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          const a = cards[i];
          const b = cards[j];
          if (!a || !b) continue;
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 1 && y > 1)
            overlaps.push({ a: i, b: j, x: Math.round(x), y: Math.round(y) });
        }
      }

      return {
        overlaps,
        listOverflowX: el.scrollWidth > el.clientWidth + 1,
        bodyOverflowX:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      };
    });

    expect(
      metrics.overlaps,
      `${viewport.name} has overlapping provider cards`,
    ).toEqual([]);
    expect(
      metrics.listOverflowX,
      `${viewport.name} list overflows horizontally`,
    ).toBe(false);
    expect(
      metrics.bodyOverflowX,
      `${viewport.name} page overflows horizontally`,
    ).toBe(false);
  }
});

test("AI Providers: dashboard provider cards stay compact and left aligned", async ({
  page,
}) => {
  await setAuthed(page);
  await mockManagementApi(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/#/access/ai-providers");

  for (const provider of [
    {
      tab: "OpenCode Go",
      title: "OC usage nearly full",
      hiddenTexts: ["sk-opencode", "Models", "模型"],
    },
    {
      tab: "ClinePass",
      title: "Cline usage card",
      hiddenTexts: [
        "sk-cli***7890",
        "https://api.cline.bot/api/v1",
        "Models",
        "模型",
      ],
    },
    {
      tab: "Ollama Cloud",
      title: "Ollama usage card",
      hiddenTexts: ["sk-oll***4321", "https://ollama.com", "Models", "模型"],
    },
  ]) {
    await page.getByRole("tab", { name: provider.tab }).click();

    const list = page.getByTestId("providers-tab-scroll");
    await expect(list).toBeVisible();
    await expect(page.getByText(provider.title, { exact: true })).toBeVisible();

    for (const text of provider.hiddenTexts) {
      await expect(list).not.toContainText(text);
    }

    const titleLeftOffset = await getTitleLeftOffset(page, provider.title);
    expect(
      titleLeftOffset,
      `${provider.tab} title should align to card padding`,
    ).toBeGreaterThanOrEqual(15);
    expect(
      titleLeftOffset,
      `${provider.tab} title should align to card padding`,
    ).toBeLessThanOrEqual(19);
  }
});
