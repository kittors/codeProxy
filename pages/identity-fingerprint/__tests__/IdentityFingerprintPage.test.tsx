import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parse as parseYaml } from "yaml";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { IdentityFingerprintPage } from "../IdentityFingerprintPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  identityGet: vi.fn(),
  identityUpdate: vi.fn(),
  identityDeleteLearned: vi.fn(),
  codexRecommendations: vi.fn(),
  fetchConfigYaml: vi.fn(),
  saveConfigYaml: vi.fn(),
}));

vi.mock("@code-proxy/api-client/endpoints/identity-fingerprint", () => ({
  identityFingerprintApi: {
    get: mocks.identityGet,
    getCodexRecommendations: mocks.codexRecommendations,
    update: mocks.identityUpdate,
    deleteLearned: mocks.identityDeleteLearned,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/config-file", () => ({
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <IdentityFingerprintPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const configYaml = `
claude-header-defaults:
  user-agent: "claude-cli/test"
  package-version: "0.70.0"
  runtime-version: "v22.11.0"
  timeout: "500"
gemini-api-key:
  - api-key: "gemini-key-1"
    headers:
      User-Agent: "gemini-cli/test"
      X-Goog-Api-Client: "gl-node/22.17.0"
  - api-key: "gemini-key-2"
kimi-header-defaults:
  user-agent: "KimiCLI/test"
  platform: "kimi_cli"
  version: "1.9.0"
`;

const learnedTimestamps = {
  created_at: "2026-06-23T08:00:00Z",
  updated_at: "2026-06-23T08:05:00Z",
  last_seen_at: "2026-06-23T08:05:00Z",
};

const identityResponse = () => ({
  "identity-fingerprint": {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/test",
      version: "0.120.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=test",
      "x-codex-beta-features": "",
      "session-mode": "per-request",
      "custom-headers": {
        "X-Old-Fingerprint": "stale",
      },
    },
    claude: {
      enabled: false,
      "cli-version": "2.1.88",
      entrypoint: "cli",
      "user-agent": "claude-cli/2.1.88 (external, cli)",
      "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
      "stainless-package-version": "0.74.0",
      "stainless-runtime-version": "v22.13.0",
      "stainless-timeout": "600",
      "session-mode": "per-request",
      "custom-headers": {},
    },
    gemini: {
      enabled: true,
      "user-agent": "",
      "x-goog-api-client": "",
      "client-metadata": "",
      "custom-headers": {},
    },
  },
  defaults: {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/default",
      version: "0.120.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=default",
      "x-codex-beta-features": "",
      "session-mode": "per-request",
      "custom-headers": {},
    },
    claude: {
      enabled: false,
      "cli-version": "2.1.88",
      entrypoint: "cli",
      "user-agent": "claude-cli/2.1.88 (external, cli)",
      "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
      "stainless-package-version": "0.74.0",
      "stainless-runtime-version": "v22.13.0",
      "stainless-timeout": "600",
      "session-mode": "per-request",
      "custom-headers": {},
    },
    gemini: {
      enabled: false,
      "user-agent": "google-api-nodejs-client/9.15.1",
      "x-goog-api-client": "gl-node/22.17.0",
      "client-metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
      "custom-headers": {},
    },
  },
  learned: {
    codex: [
      {
        provider: "codex",
        account_key: "codex-account-1",
        auth_subject_id: "codex-subject-1",
        client_product: "codex_cli_rs",
        client_variant: "codex_cli_rs",
        version: "0.130.0",
        fields: {
          "user-agent": "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
          version: "0.130.0",
          originator: "codex_cli_rs",
          "x-codex-beta-features": "compact_mode",
        },
        observed_headers: {
          "User-Agent": "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
          Version: "0.130.0",
          Originator: "codex_cli_rs",
          "X-Codex-Beta-Features": "compact_mode",
        },
        ...learnedTimestamps,
      },
    ],
    claude: [
      {
        provider: "claude",
        account_key: "claude-account-1",
        auth_subject_id: "claude-subject-1",
        client_product: "claude-cli",
        client_variant: "cli",
        version: "2.1.200",
        fields: {
          "user-agent": "claude-cli/2.1.200 (external, cli)",
          "cli-version": "2.1.200",
          entrypoint: "cli",
          "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
          "stainless-package-version": "0.99.0",
          "stainless-runtime-version": "v24.4.0",
          "stainless-timeout": "700",
        },
        observed_headers: {
          "User-Agent": "claude-cli/2.1.200 (external, cli)",
          "X-App": "cli",
          "Anthropic-Beta": "claude-code-20250219,oauth-2025-04-20",
        },
        ...learnedTimestamps,
      },
    ],
    gemini: [
      {
        provider: "gemini",
        account_key: "gemini-account-1",
        auth_subject_id: "gemini-subject-1",
        client_product: "google-api-nodejs-client",
        client_variant: "cli",
        version: "9.16.0",
        fields: {
          "user-agent": "google-api-nodejs-client/9.16.0",
          "x-goog-api-client": "gl-node/24.1.0",
          "client-metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
        observed_headers: {
          "User-Agent": "google-api-nodejs-client/9.16.0",
          "X-Goog-Api-Client": "gl-node/24.1.0",
          "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
        ...learnedTimestamps,
      },
    ],
  },
  effective: {
    codex: [
      {
        provider: "codex",
        account_key: "codex-account-1",
        auth_subject_id: "codex-subject-1",
        enabled: false,
        client_product: "codex_cli_rs",
        version: "0.130.0",
        fields: {
          "user-agent": {
            value: "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
            source: "learned",
          },
          version: { value: "0.130.0", source: "learned" },
          originator: { value: "codex_cli_rs", source: "learned" },
          "websocket-beta": { value: "responses_websockets=default", source: "default" },
          "x-codex-beta-features": { value: "compact_mode", source: "learned" },
        },
      },
    ],
    claude: [
      {
        provider: "claude",
        account_key: "claude-account-1",
        auth_subject_id: "claude-subject-1",
        enabled: false,
        client_product: "claude-cli",
        version: "2.1.200",
        fields: {
          "user-agent": { value: "claude-cli/2.1.200 (external, cli)", source: "learned" },
          "cli-version": { value: "2.1.88", source: "custom" },
          entrypoint: { value: "cli", source: "custom" },
          "anthropic-beta": {
            value: "oauth-2025-04-20,claude-code-20250219",
            source: "custom",
          },
          "stainless-package-version": { value: "0.74.0", source: "custom" },
          "stainless-runtime-version": { value: "v22.13.0", source: "custom" },
          "stainless-timeout": { value: "600", source: "custom" },
        },
      },
    ],
    gemini: [
      {
        provider: "gemini",
        account_key: "gemini-account-1",
        auth_subject_id: "gemini-subject-1",
        enabled: true,
        client_product: "google-api-nodejs-client",
        version: "9.16.0",
        fields: {
          "user-agent": { value: "google-api-nodejs-client/9.16.0", source: "learned" },
          "x-goog-api-client": { value: "gl-node/24.1.0", source: "learned" },
          "client-metadata": {
            value: "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
            source: "learned",
          },
        },
      },
    ],
  },
  status: {
    codex: { enabled: false, learned_count: 1 },
    claude: { enabled: false, learned_count: 1 },
    gemini: { enabled: true, learned_count: 1 },
  },
});

describe("IdentityFingerprintPage provider tabs", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.identityGet.mockResolvedValue(identityResponse());
    mocks.identityUpdate.mockResolvedValue({ status: "ok" });
    mocks.identityDeleteLearned.mockResolvedValue({ deleted: 1 });
    mocks.codexRecommendations.mockResolvedValue({
      items: [
        {
          id: "codex-real-125",
          count: 2,
          first_seen_at: "2026-06-14T10:00:00Z",
          last_seen_at: "2026-06-14T10:03:00Z",
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
            Session_id: "sess...abcd",
            "X-Codex-Turn-Metadata": '{"turn":"sample"}',
          },
          samples: [
            {
              log_id: 101,
              timestamp: "2026-06-14T10:03:00Z",
              model: "gpt-5.4",
              source: "codex",
              channel_name: "Codex",
              auth_index: "auth-1",
              failed: false,
              method: "POST",
              path: "/v1/responses",
              host: "relay.test",
              ip: "203.0.113.10",
            },
          ],
        },
      ],
      days: 7,
      limit: 200,
      inspected: 2,
      matched: 2,
    });
    mocks.fetchConfigYaml.mockResolvedValue(configYaml);
    mocks.saveConfigYaml.mockResolvedValue({ status: "ok" });
  });

  test("renders Claude, Gemini, and Kimi as real editable provider panels", async () => {
    renderPage();

    expect((await screen.findAllByText("codex-account-1")).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 learned accounts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^learned$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("compact_mode").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Manual overrides have the highest priority.*not recommended/i),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("tab", { name: "Claude" }));
    expect(
      await screen.findByRole("heading", { name: /Claude Code Fingerprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Manual values override learned\/default values.*not recommended/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("claude-cli/2.1.88 (external, cli)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.74.0")).toBeInTheDocument();
    expect(screen.getAllByText("claude-account-1").length).toBeGreaterThan(0);
    expect(screen.queryByText(/reserved/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Gemini" }));
    expect(
      await screen.findByRole("heading", { name: /Gemini OAuth\/CLI Fingerprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Manual values override learned\/default values.*not recommended/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("gemini-account-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gl-node/24.1.0").length).toBeGreaterThan(0);
    expect(
      await screen.findByRole("heading", { name: /Gemini API Key Headers/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(/gemini-cli\/test/)).toBeInTheDocument();
    expect(screen.getByText(/2 Gemini API key entries/i)).toBeInTheDocument();
    expect(screen.queryByText(/reserved/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Kimi" }));
    expect(
      await screen.findByRole("heading", { name: /Kimi Header Defaults/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("KimiCLI/test")).toBeInTheDocument();
    expect(screen.getByDisplayValue("kimi_cli")).toBeInTheDocument();
    expect(screen.queryByText(/reserved/i)).not.toBeInTheDocument();
  });

  test("saves Gemini headers back to every configured Gemini API key entry", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Gemini" }));
    const panel = await screen.findByRole("heading", { name: /Gemini API Key Headers/i });
    const section = panel.closest("section");
    expect(section).not.toBeNull();

    const textarea = within(section as HTMLElement).getByLabelText(/Headers JSON/i);
    await userEvent.clear(textarea);
    fireEvent.change(textarea, {
      target: {
        value: JSON.stringify({
          "User-Agent": "gemini-cli/new",
          "X-Test-Fingerprint": "enabled",
        }),
      },
    });
    await userEvent.click(
      within(section as HTMLElement).getByRole("button", { name: /Save Gemini/i }),
    );

    await waitFor(() => {
      expect(mocks.saveConfigYaml).toHaveBeenCalledTimes(1);
    });

    const savedYaml = String(mocks.saveConfigYaml.mock.calls[0]?.[0] ?? "");
    const parsed = parseYaml(savedYaml) as Record<string, unknown>;
    const geminiKeys = parsed["gemini-api-key"] as Array<{ headers?: Record<string, string> }>;
    expect(geminiKeys).toHaveLength(2);
    expect(geminiKeys.every((entry) => entry.headers?.["User-Agent"] === "gemini-cli/new")).toBe(
      true,
    );
    expect(geminiKeys.every((entry) => entry.headers?.["X-Test-Fingerprint"] === "enabled")).toBe(
      true,
    );
  });

  test("saves Gemini OAuth CLI fingerprint through the identity fingerprint API", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Gemini" }));
    const panel = await screen.findByRole("heading", {
      name: /Gemini OAuth\/CLI Fingerprint/i,
    });
    const section = panel.closest("section");
    expect(section).not.toBeNull();

    const autoLearnInputs = within(section as HTMLElement).getAllByPlaceholderText(
      /Auto learn from real client requests/i,
    );
    expect(autoLearnInputs).toHaveLength(3);
    const [userAgentInput, apiClientInput, clientMetadataInput] = autoLearnInputs;
    await userEvent.type(userAgentInput, "google-api-nodejs-client/9.17.0");
    await userEvent.type(apiClientInput, "gl-node/24.5.0");
    await userEvent.type(
      clientMetadataInput,
      "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
    );
    await userEvent.click(screen.getByRole("button", { name: /Save Gemini Fingerprint/i }));

    await waitFor(() => {
      expect(mocks.identityUpdate).toHaveBeenCalledTimes(1);
    });

    expect(mocks.identityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        gemini: expect.objectContaining({
          enabled: true,
          "user-agent": "google-api-nodejs-client/9.17.0",
          "x-goog-api-client": "gl-node/24.5.0",
          "client-metadata":
            "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        }),
      }),
    );
    expect(mocks.saveConfigYaml).not.toHaveBeenCalled();
  });

  test("clears a learned account fingerprint without changing manual config", async () => {
    renderPage();

    expect((await screen.findAllByText("codex-account-1")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Clear learned/i }));

    await waitFor(() => {
      expect(mocks.identityDeleteLearned).toHaveBeenCalledTimes(1);
    });
    expect(mocks.identityDeleteLearned).toHaveBeenCalledWith("codex", "codex-account-1");
    expect(mocks.identityUpdate).not.toHaveBeenCalled();
  });

  test("saves Claude fingerprint through the identity fingerprint API", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Claude" }));
    await userEvent.click(await screen.findByRole("switch", { name: /Enable Claude/i }));
    await userEvent.clear(screen.getByLabelText(/Claude CLI version/i));
    await userEvent.type(screen.getByLabelText(/Claude CLI version/i), "2.2.0");
    await userEvent.clear(screen.getByLabelText(/Entrypoint/i));
    await userEvent.type(screen.getByLabelText(/Entrypoint/i), "sdk-cli");
    await userEvent.click(screen.getByRole("button", { name: /Save Claude/i }));

    await waitFor(() => {
      expect(mocks.identityUpdate).toHaveBeenCalledTimes(1);
    });

    expect(mocks.identityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        codex: expect.objectContaining({
          "user-agent": "codex_cli_rs/test",
        }),
        claude: expect.objectContaining({
          enabled: true,
          "cli-version": "2.2.0",
          entrypoint: "sdk-cli",
          "stainless-package-version": "0.74.0",
        }),
      }),
    );
    expect(mocks.saveConfigYaml).not.toHaveBeenCalled();
  });

  test("applies and saves a log-derived Codex recommendation after confirmation", async () => {
    renderPage();

    await screen.findByDisplayValue("codex_cli_rs/test");
    mocks.identityGet.mockResolvedValue({
      "identity-fingerprint": {
        codex: {
          enabled: true,
          "user-agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
          version: "0.125.0",
          originator: "codex-tui",
          "x-codex-beta-features": "exec_command_v2",
          "session-mode": "per-request",
          "session-id": "",
          "custom-headers": {},
        },
        claude: {
          enabled: false,
          "cli-version": "2.1.88",
          entrypoint: "cli",
          "user-agent": "claude-cli/2.1.88 (external, cli)",
          "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
          "stainless-package-version": "0.74.0",
          "stainless-runtime-version": "v22.13.0",
          "stainless-timeout": "600",
          "session-mode": "per-request",
          "custom-headers": {},
        },
      },
      defaults: {
        codex: {
          enabled: false,
          "user-agent": "codex_cli_rs/default",
          version: "0.120.0",
          originator: "codex_cli_rs",
          "websocket-beta": "responses_websockets=default",
          "x-codex-beta-features": "",
          "session-mode": "per-request",
          "custom-headers": {},
        },
        claude: {
          enabled: false,
          "cli-version": "2.1.88",
          entrypoint: "cli",
          "user-agent": "claude-cli/2.1.88 (external, cli)",
          "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
          "stainless-package-version": "0.74.0",
          "stainless-runtime-version": "v22.13.0",
          "stainless-timeout": "600",
          "session-mode": "per-request",
          "custom-headers": {},
        },
      },
    });
    await userEvent.click(screen.getByRole("button", { name: /Generate from recent requests/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Codex Fingerprint Recommendations/i,
    });
    expect(mocks.codexRecommendations).toHaveBeenCalledWith(
      { days: 7, limit: 200 },
      expect.objectContaining({ timeoutMs: 15000 }),
    );
    expect(within(dialog).getAllByText(/codex-tui\/0\.125\.0/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/sess\.\.\.abcd/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Actions$/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /Apply and save/i }));
    expect(
      screen.queryByDisplayValue("codex-tui/0.125.0 (Mac OS 26.5; arm64)"),
    ).not.toBeInTheDocument();

    const confirmDialog = await screen.findByRole("dialog", {
      name: /Apply this recommended fingerprint/i,
    });
    expect(
      within(confirmDialog).getByText(/codex-tui 0\.125\.0/i),
    ).toBeInTheDocument();
    await userEvent.click(within(confirmDialog).getByRole("button", { name: /Apply and save/i }));

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("codex-tui/0.125.0 (Mac OS 26.5; arm64)"),
      ).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("0.125.0")).toBeInTheDocument();
    expect(screen.getByDisplayValue("codex-tui")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/exec_command_v2/)).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.identityUpdate).toHaveBeenCalledTimes(1);
    });
    expect(mocks.identityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        codex: expect.objectContaining({
          enabled: true,
          "user-agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
          version: "0.125.0",
          originator: "codex-tui",
          "x-codex-beta-features": "exec_command_v2",
          "session-mode": "per-request",
          "session-id": "",
          "custom-headers": {},
        }),
      }),
    );
  });

  test("selects a Codex recommendation row without applying until confirmation", async () => {
    mocks.codexRecommendations.mockResolvedValueOnce({
      items: [
        {
          id: "codex-cli",
          count: 2,
          first_seen_at: "2026-06-14T10:00:00Z",
          last_seen_at: "2026-06-14T10:03:00Z",
          headers: {
            "User-Agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
            Version: "0.125.0",
            Originator: "codex-tui",
          },
          recommended: {
            enabled: true,
            "user-agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
            version: "0.125.0",
            originator: "codex-tui",
            "session-mode": "per-request",
            "custom-headers": {},
          },
          ignored_headers: {},
          samples: [],
        },
        {
          id: "codex-desktop",
          count: 4,
          first_seen_at: "2026-06-14T11:00:00Z",
          last_seen_at: "2026-06-14T11:30:00Z",
          headers: {
            "User-Agent":
              "Codex Desktop/0.140.0-alpha.2 (Windows 10.0.26200; x86_64) unknown (Codex Desktop; 26.609.41114)",
            Originator: "Codex Desktop",
            "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
          },
          recommended: {
            enabled: true,
            "user-agent":
              "Codex Desktop/0.140.0-alpha.2 (Windows 10.0.26200; x86_64) unknown (Codex Desktop; 26.609.41114)",
            originator: "Codex Desktop",
            "session-mode": "per-request",
            "custom-headers": {
              "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
            },
          },
          ignored_headers: {
            Session_id: "sess...desktop",
          },
          samples: [],
        },
      ],
      days: 7,
      limit: 200,
      inspected: 6,
      matched: 6,
    });

    renderPage();
    await screen.findByDisplayValue("codex_cli_rs/test");
    await userEvent.click(screen.getByRole("button", { name: /Generate from recent requests/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /Codex Fingerprint Recommendations/i,
    });
    const desktopRow = within(dialog).getByText("Codex Desktop").closest("tr");
    expect(desktopRow).not.toBeNull();
    await userEvent.click(desktopRow as HTMLElement);

    expect(desktopRow).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getAllByText(/0\.140\.0-alpha\.2/).length).toBeGreaterThan(0);
    expect(
      screen.queryByDisplayValue(/Codex Desktop\/0\.140\.0-alpha\.2/),
    ).not.toBeInTheDocument();
    mocks.identityGet.mockResolvedValue({
      "identity-fingerprint": {
        codex: {
          enabled: true,
          "user-agent":
            "Codex Desktop/0.140.0-alpha.2 (Windows 10.0.26200; x86_64) unknown (Codex Desktop; 26.609.41114)",
          originator: "Codex Desktop",
          "x-codex-beta-features": "terminal_resize_reflow,memories,remote_compaction_v2",
          "session-mode": "per-request",
          "custom-headers": {},
        },
        claude: {
          enabled: false,
          "cli-version": "2.1.88",
          entrypoint: "cli",
          "user-agent": "claude-cli/2.1.88 (external, cli)",
          "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
          "stainless-package-version": "0.74.0",
          "stainless-runtime-version": "v22.13.0",
          "stainless-timeout": "600",
          "session-mode": "per-request",
          "custom-headers": {},
        },
      },
      defaults: {
        codex: {
          enabled: false,
          "user-agent": "codex_cli_rs/default",
          version: "0.120.0",
          originator: "codex_cli_rs",
          "websocket-beta": "responses_websockets=default",
          "x-codex-beta-features": "",
          "session-mode": "per-request",
          "custom-headers": {},
        },
        claude: {
          enabled: false,
          "cli-version": "2.1.88",
          entrypoint: "cli",
          "user-agent": "claude-cli/2.1.88 (external, cli)",
          "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
          "stainless-package-version": "0.74.0",
          "stainless-runtime-version": "v22.13.0",
          "stainless-timeout": "600",
          "session-mode": "per-request",
          "custom-headers": {},
        },
      },
    });

    await userEvent.click(within(dialog).getByRole("button", { name: /Apply and save/i }));
    const confirmDialog = await screen.findByRole("dialog", {
      name: /Apply this recommended fingerprint/i,
    });
    await userEvent.click(within(confirmDialog).getByRole("button", { name: /Apply and save/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(/Codex Desktop\/0\.140\.0-alpha\.2/)).toBeInTheDocument();
    });
  });
});
