import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { QuickImportTabContent } from "@/modules/apikey-lookup/components/QuickImportTabContent";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const quickImportConfigs = [
  {
    id: "codex-pro",
    "client-type": "codex",
    "provider-name": "Team Codex",
    note: "Primary Codex pool",
    "default-model": "gpt-5.3-codex",
    "model-mappings": [
      {
        "request-model": "gpt-5.3-codex",
        "target-model": "gpt-5.3-codex",
      },
    ],
    "allowed-channel-groups": ["pro"],
    "route-path": "/pro/cs_codex",
    "endpoint-path": "/v1",
    "usage-auto-interval": 60,
  },
  {
    id: "claude-team",
    "client-type": "claude",
    "provider-name": "Team Claude",
    note: "",
    "default-model": "claude-sonnet-4-5",
    "model-mappings": [
      {
        role: "main",
        "request-model": "sonnet",
        "target-model": "claude-sonnet-4-5",
      },
    ],
    "allowed-channel-groups": ["team-a"],
    "route-path": "/team-a/cs_claude",
    "endpoint-path": "/v1/messages",
    "usage-auto-interval": 120,
    "api-key-field": "ANTHROPIC_AUTH_TOKEN",
  },
  {
    id: "gemini-hidden",
    "client-type": "gemini",
    "provider-name": "Team Gemini",
    note: "",
    "default-model": "gemini-2.5-pro",
    "model-mappings": [],
    "allowed-channel-groups": [],
    "route-path": "/gemini/cs_gemini",
    "endpoint-path": "/v1beta",
    "usage-auto-interval": 60,
  },
];

describe("QuickImportTabContent", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "ccswitch-import-configs": quickImportConfigs }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("groups Codex and Claude quick import cards and launches the selected preset", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByRole("link", { name: /download the latest cc switch/i })).toHaveAttribute(
      "href",
      "https://github.com/farion1231/cc-switch/releases",
    );

    const codexSection = await screen.findByRole("region", { name: /codex quick imports/i });
    const claudeSection = await screen.findByRole("region", { name: /claude quick imports/i });

    expect(screen.getByRole("heading", { name: /cc switch card presets/i })).toBeInTheDocument();
    expect(
      screen.queryByText(/only codex and claude presets are shown here for now/i),
    ).not.toBeInTheDocument();
    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(within(claudeSection).getByRole("button", { name: /team claude/i })).toBeInTheDocument();
    expect(screen.queryByText("Team Gemini")).not.toBeInTheDocument();

    await userEvent.click(within(codexSection).getByRole("button", { name: /team codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("name")).toBe("Team Codex");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-lookup-key");
    expect(parsed.searchParams.get("endpoint")).toMatch(/\/pro\/cs_codex\/v1$/);
  });

  test("hides quick import groups that do not have presets", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ "ccswitch-import-configs": [quickImportConfigs[0]] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    const codexSection = await screen.findByRole("region", { name: /codex quick imports/i });

    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /claude quick imports/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no claude presets yet/i)).not.toBeInTheDocument();
  });
});
