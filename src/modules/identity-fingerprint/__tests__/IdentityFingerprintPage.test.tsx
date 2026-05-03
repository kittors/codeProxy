import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parse as parseYaml } from "yaml";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { IdentityFingerprintPage } from "@/modules/identity-fingerprint/IdentityFingerprintPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  identityGet: vi.fn(),
  identityUpdate: vi.fn(),
  fetchConfigYaml: vi.fn(),
  saveConfigYaml: vi.fn(),
}));

vi.mock("@/lib/http/apis/identity-fingerprint", () => ({
  identityFingerprintApi: {
    get: mocks.identityGet,
    update: mocks.identityUpdate,
  },
}));

vi.mock("@/lib/http/apis/config-file", () => ({
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

describe("IdentityFingerprintPage provider tabs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.identityGet.mockResolvedValue({
      "identity-fingerprint": {
        codex: {
          enabled: false,
          "user-agent": "codex_cli_rs/test",
          version: "0.120.0",
          originator: "codex_cli_rs",
          "websocket-beta": "responses_websockets=test",
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
    mocks.identityUpdate.mockResolvedValue({ status: "ok" });
    mocks.fetchConfigYaml.mockResolvedValue(configYaml);
    mocks.saveConfigYaml.mockResolvedValue({ status: "ok" });
  });

  test("renders Claude, Gemini, and Kimi as real editable provider panels", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Claude" }));
    expect(
      await screen.findByRole("heading", { name: /Claude Code Fingerprint/i }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("claude-cli/2.1.88 (external, cli)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.74.0")).toBeInTheDocument();
    expect(screen.queryByText(/reserved/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Gemini" }));
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
});
