import { expect, test, type Page } from "@playwright/test";

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
    "api-key": "sk-opencode-go-gamma-verylongkey-1234567890abcdef1234567890abcdef",
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

const usageStats = opencodeGoKeys.map((item, index) => ({
  entity_name: item["api-key"],
  requests: [5524, 4872, 3105, 0, 3381, 0][index] ?? 0,
  failed: [279, 209, 78, 0, 163, 0][index] ?? 0,
  avg_latency: 320,
  total_tokens: 1000,
}));

const opencodeGoUsage = [
  { type: "rolling", label: "Rolling", percentage: 4, resets_in: "31 minutes" },
  { type: "weekly", label: "Weekly", percentage: 47, resets_in: "4 days" },
  { type: "monthly", label: "Monthly", percentage: 96.8, resets_in: "12 days" },
];

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
    if (managementPath === "/opencode-go-api-key" && request.method() === "GET") {
      return fulfillJson({ "opencode-go-api-key": opencodeGoKeys });
    }
    if (managementPath === "/opencode-go-api-key/usage" && request.method() === "POST") {
      return fulfillJson({ workspace_id: "wrk_test", usage: opencodeGoUsage });
    }
    return fulfillJson({});
  });
};

test("AI Providers: OpenCode Go cards should not overlap on responsive layouts", async ({
  page,
}) => {
  await setAuthed(page);
  await mockManagementApi(page);

  for (const viewport of testedViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/#/ai-providers");

    const list = page.getByTestId("providers-tab-scroll");
    await expect(list).toBeVisible();
    await expect.poll(() => list.locator("> *").count()).toBe(opencodeGoKeys.length);
    await expect.poll(() => list.textContent()).toContain("剩余 3.2%");

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

      const overlaps: Array<{ a: number; b: number; x: number; y: number }> = [];
      for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
          const a = cards[i];
          const b = cards[j];
          if (!a || !b) continue;
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (x > 1 && y > 1) overlaps.push({ a: i, b: j, x: Math.round(x), y: Math.round(y) });
        }
      }

      return {
        overlaps,
        listOverflowX: el.scrollWidth > el.clientWidth + 1,
        bodyOverflowX:
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    expect(metrics.overlaps, `${viewport.name} has overlapping provider cards`).toEqual([]);
    expect(metrics.listOverflowX, `${viewport.name} list overflows horizontally`).toBe(false);
    expect(metrics.bodyOverflowX, `${viewport.name} page overflows horizontally`).toBe(false);
  }
});
