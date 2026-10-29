import { expect, test, type Page } from "@playwright/test";

/*
 * Why an account is cooling and the per-model "retry now" on the AI accounts page, against a mocked
 * management API: the reason and time on the card badge, the cooling-models menu, the retry round
 * trip, a failed retry, the countdown running on its own clock, and a backend that predates all of
 * it (no menu, no request).
 */

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

const coolingModels = () => [
  { model: "gpt-5.5", reason: "rate_limited", until: inSeconds(95), http_status: 429 },
  { model: "gpt-5.4", reason: "upstream_error", until: inSeconds(900), http_status: 503 },
];

const coolingFile = (models: ReturnType<typeof coolingModels> | undefined) => ({
  name: "cooling-codex.json",
  type: "codex",
  provider: "codex",
  label: "Cooling Codex",
  account_type: "oauth",
  auth_index: "cool-1",
  disabled: false,
  size: 1024,
  modified: 1782182400000,
  restrictions: [
    {
      scope: "auth",
      status: "error",
      unavailable: true,
      http_status: 429,
      cooldown_reason: "rate_limited",
      next_retry_after: inSeconds(95),
    },
  ],
  ...(models ? { model_cooldowns: models } : {}),
});

const healthyFile = {
  name: "healthy-codex.json",
  type: "codex",
  provider: "codex",
  label: "Healthy Codex",
  account_type: "oauth",
  auth_index: "ok-1",
  disabled: false,
  size: 1024,
  modified: 1782182400000,
};

// What a backend from before the cooldown fields sends for the same situation.
const oldBackendFile = {
  ...coolingFile(undefined),
  restrictions: [
    {
      scope: "auth",
      status: "error",
      unavailable: true,
      http_status: 429,
      next_retry_after: inSeconds(95),
    },
  ],
};

const setAuthed = async (page: Page, viewMode: "table" | "cards" = "cards") => {
  await page.addInitScript((mode) => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify(mode));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
  }, viewMode);
};

type Mock = {
  /** Bodies of the POSTs to /auth-files/model-cooldown/clear, in order. */
  cleared: Array<Record<string, unknown>>;
};

const routeManagementMocks = async (
  page: Page,
  options: {
    list: () => unknown[];
    onClear?: (body: Record<string, unknown>) => { status: number; body: unknown };
  },
): Promise<Mock> => {
  const mock: Mock = { cleared: [] };
  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/v0/management/auth-files/model-cooldown/clear")) {
      const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      mock.cleared.push(body);
      const reply = options.onClear?.(body) ?? { status: 200, body: { status: "ok", changed: true } };
      await json(reply.body, reply.status);
      return;
    }
    if (path.endsWith("/v0/management/auth-files/models")) {
      await json({ models: [] });
      return;
    }
    if (path.endsWith("/v0/management/auth-files")) {
      await json({ files: options.list() });
      return;
    }
    if (path.endsWith("/v0/management/model-configs") || path.endsWith("/v0/management/model-owner-presets")) {
      await json([]);
      return;
    }
    if (path.endsWith("/v0/management/auth-group-model-owner-mappings") || path.endsWith("/v0/management/proxy-pool")) {
      await json({ items: [] });
      return;
    }
    if (path.endsWith("/v0/management/usage/entity-stats")) {
      await json({ source: [], auth_index: [] });
      return;
    }
    if (path.endsWith("/v0/management/usage")) {
      await json({ apis: {} });
      return;
    }
    if (path.endsWith("/v0/management/update/check")) {
      await json({ update_available: false });
      return;
    }
    await json({});
  });
  return mock;
};

const card = (page: Page, title: string) =>
  page.locator('[class*="group/card"]', { hasText: title });

test("Auth Files: a cooling account says why, and one model can be retried now", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  let cleared = false;
  const mock = await routeManagementMocks(page, {
    list: () => [coolingFile(cleared ? coolingModels().slice(1) : coolingModels()), healthyFile],
    onClear: () => {
      cleared = true;
      return { status: 200, body: { status: "ok", changed: true } };
    },
  });

  await page.goto("/#/auth-files");

  const cooling = card(page, "Cooling Codex");
  await expect(cooling).toBeVisible();
  await expect(cooling.getByTestId("auth-file-restriction-badge")).toHaveText(
    /^Rate limited · (1m \d+s|\d+s)$/,
  );
  const trigger = cooling.getByTestId("auth-file-model-cooldown-trigger");
  await expect(trigger).toHaveText("Cooling models: 2");

  const healthy = card(page, "Healthy Codex");
  await expect(healthy).toBeVisible();
  await expect(healthy.getByTestId("auth-file-model-cooldown-trigger")).toHaveCount(0);

  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(menu.getByRole("menuitem", { name: /Retry gpt-5\.4 now/ })).toContainText(
    /Upstream error · 1\dm/,
  );
  await menu.getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }).click();

  await expect.poll(() => mock.cleared).toEqual([{ auth_index: "cool-1", model: "gpt-5.5" }]);
  await expect(page.getByText('"gpt-5.5" on "Cooling Codex" can be tried again now')).toBeVisible();
  await expect(cooling.getByTestId("auth-file-model-cooldown-trigger")).toHaveText(
    "Cooling models: 1",
  );
});

test("Auth Files: the countdown keeps running, and the chip and the menu go away when the cooldown ends", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  // The page clock only moves while quota auto-refresh is on, and it is off by default. The
  // countdown has to run anyway, so the browser clock is driven here instead of waiting.
  await page.clock.install({ time: new Date() });
  await routeManagementMocks(page, {
    list: () => [
      coolingFile([
        { model: "gpt-5.5", reason: "rate_limited", until: inSeconds(95), http_status: 429 },
      ]),
    ],
  });

  await page.goto("/#/auth-files");

  const cooling = card(page, "Cooling Codex");
  const badge = cooling.getByTestId("auth-file-restriction-badge");
  const trigger = cooling.getByTestId("auth-file-model-cooldown-trigger");
  await expect(badge).toHaveText(/^Rate limited · 1m \d+s$/);
  await expect(trigger).toHaveText("Cooling models: 1");

  // 95s minus a minute: seconds only, no minutes left.
  await page.clock.fastForward(60_000);
  await expect(badge).toHaveText(/^Rate limited · \d{1,2}s$/);

  await page.clock.fastForward(60_000);
  await expect(badge).toHaveCount(0);
  await expect(trigger).toHaveCount(0);
});

test("Auth Files: a failed retry is reported and the card keeps its cooling models", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const mock = await routeManagementMocks(page, {
    list: () => [coolingFile(coolingModels())],
    onClear: () => ({ status: 404, body: { error: "auth not found" } }),
  });

  await page.goto("/#/auth-files");

  const cooling = card(page, "Cooling Codex");
  await cooling.getByTestId("auth-file-model-cooldown-trigger").click();
  await page.getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }).click();

  await expect(page.getByText(/Failed to retry "gpt-5\.5" on "Cooling Codex"/)).toBeVisible();
  expect(mock.cleared).toHaveLength(1);
  await expect(cooling.getByTestId("auth-file-model-cooldown-trigger")).toHaveText(
    "Cooling models: 2",
  );
});

test("Auth Files: a backend without the cooldown fields shows the old badge and no retry", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const mock = await routeManagementMocks(page, { list: () => [oldBackendFile] });

  await page.goto("/#/auth-files");

  const cooling = card(page, "Cooling Codex");
  await expect(cooling).toBeVisible();
  await expect(cooling.getByTestId("auth-file-restriction-badge")).toHaveText("429 Error");
  await expect(cooling.getByTestId("auth-file-model-cooldown-trigger")).toHaveCount(0);
  expect(mock.cleared).toHaveLength(0);
});

test("Auth Files: the table row carries the same badge and menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page, "table");
  await routeManagementMocks(page, { list: () => [coolingFile(coolingModels())] });

  await page.goto("/#/auth-files");

  const row = page.locator("tr", { hasText: "Cooling Codex" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("auth-file-restriction-badge")).toContainText("Rate limited · ");
  await expect(row.getByTestId("auth-file-model-cooldown-trigger")).toHaveText("Cooling models: 2");
});

test("Auth Files: on a phone the chip stays inside its card and the menu stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setAuthed(page);
  await routeManagementMocks(page, { list: () => [coolingFile(coolingModels())] });

  await page.goto("/#/auth-files");

  const cooling = card(page, "Cooling Codex");
  const trigger = cooling.getByTestId("auth-file-model-cooldown-trigger");
  await expect(trigger).toBeVisible();
  const cardBox = await cooling.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  // Fully inside the viewport. The popper places the menu a frame after it mounts (more under
  // load), so this is retried until the menu has settled, and fails if it never fits.
  await expect(menu).toBeInViewport({ ratio: 1 });
});
