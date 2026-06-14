import { expect, test, type Page } from "@playwright/test";

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
  });
};

const identityPayload = {
  "identity-fingerprint": {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/0.125.0 (Mac OS 26.0; arm64)",
      version: "0.125.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=old",
      "session-mode": "per-request",
      "custom-headers": {
        "X-Old-Fingerprint": "stale",
      },
    },
    claude: {},
  },
  defaults: {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/default",
      version: "0.125.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=default",
      "session-mode": "per-request",
      "custom-headers": {},
    },
    claude: {},
  },
};

const configYaml = `
gemini-api-key:
  - api-key: "gemini-key"
    headers:
      User-Agent: "gemini-cli/test"
kimi-header-defaults:
  user-agent: "KimiCLI/test"
  platform: "kimi_cli"
  version: "1.9.0"
`;

const desktopUserAgent =
  "Codex Desktop/0.140.0-alpha.2 (Windows 10.0.26200; x86_64) unknown (Codex Desktop; 26.609.41114)";

const recommendationsPayload = {
  items: [
    {
      id: "codex-cli",
      count: 84,
      first_seen_at: "2026-06-14T12:00:00Z",
      last_seen_at: "2026-06-14T12:30:00Z",
      headers: {
        "User-Agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
        Version: "0.125.0",
        Originator: "codex-tui",
        "X-Codex-Beta-Features": "exec_command_v2",
      },
      recommended: {
        enabled: true,
        "user-agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
        version: "0.125.0",
        originator: "codex-tui",
        "session-mode": "per-request",
        "custom-headers": {
          "X-Codex-Beta-Features": "exec_command_v2",
        },
      },
      ignored_headers: {
        Session_id: "sess...cli",
      },
      samples: [],
    },
    {
      id: "codex-desktop",
      count: 116,
      first_seen_at: "2026-06-14T13:01:00Z",
      last_seen_at: "2026-06-14T13:30:00Z",
      headers: {
        "User-Agent": desktopUserAgent,
        Originator: "Codex Desktop",
        "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
        "X-Codex-Turn-Metadata": '{"sample":"metadata"}',
      },
      recommended: {
        enabled: true,
        "user-agent": desktopUserAgent,
        originator: "Codex Desktop",
        "session-mode": "per-request",
        "custom-headers": {
          "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
        },
      },
      ignored_headers: {
        Session_id: "sess...desktop",
        "X-Codex-Turn-Metadata": '{"sample":"metadata"}',
      },
      samples: [
        {
          log_id: 203,
          timestamp: "2026-06-14T13:30:00Z",
          model: "gpt-5",
          source: "codex",
          channel_name: "Codex",
          auth_index: "auth-1",
          failed: false,
          method: "POST",
          path: "/v1/responses",
        },
      ],
    },
  ],
  days: 7,
  limit: 200,
  inspected: 200,
  matched: 200,
};

const routeManagementMocks = async (page: Page) => {
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/config.yaml")) {
      await route.fulfill({ status: 200, contentType: "text/yaml", body: configYaml });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint/codex/recommendations")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(recommendationsPayload),
      });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint")) {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(identityPayload),
      });
      return;
    }

    if (path.endsWith("/v0/management/config")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

const hasFormValue = (page: Page, value: string) =>
  page.evaluate((expected) => {
    return Array.from(document.querySelectorAll("input, textarea")).some((element) => {
      return (element as HTMLInputElement | HTMLTextAreaElement).value === expected;
    });
  }, value);

test("Codex fingerprint recommendations modal stays contained and requires confirmation", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await routeManagementMocks(page);
  await page.goto("/manage/#/identity-fingerprint");

  await page.getByRole("button", { name: /Generate from recent requests|从近期请求生成/i }).click();
  const modal = page.getByRole("dialog", { name: /Codex Fingerprint Recommendations|Codex 推荐指纹/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Checked 200 requests|已检查 200 条请求/i)).toBeVisible();
  await expect(modal.getByText(/^Actions$|^操作$/)).toHaveCount(0);

  const desktopRow = modal.locator("tbody tr", { hasText: "Codex Desktop" });
  await expect(desktopRow).toHaveCount(1);
  await desktopRow.click();
  await expect(desktopRow).toHaveAttribute("aria-selected", "true");
  await expect(modal.getByText(desktopUserAgent)).toHaveCount(2);

  const overflow = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      dialogClientWidth: dialog?.clientWidth ?? 0,
      dialogScrollWidth: dialog?.scrollWidth ?? 0,
    };
  });
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.dialogScrollWidth).toBeLessThanOrEqual(overflow.dialogClientWidth + 1);

  await modal.getByRole("button", { name: /Apply selected|应用选中/i }).click();
  await expect.poll(() => hasFormValue(page, desktopUserAgent)).toBe(false);

  const confirm = page.getByRole("dialog", {
    name: /Apply this recommended fingerprint|应用这条推荐指纹/i,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /Confirm apply|确认应用/i }).click();

  await expect.poll(() => hasFormValue(page, desktopUserAgent)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
