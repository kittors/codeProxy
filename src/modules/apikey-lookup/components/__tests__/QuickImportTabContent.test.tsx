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
    window.localStorage.clear();
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

    expect(screen.queryByRole("heading", { name: /cc switch card presets/i })).toBeNull();
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

  test("copies the selected quick import link without launching CC Switch", async () => {
    const originalClipboard = navigator.clipboard;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <ThemeProvider>
          <ToastProvider>
            <QuickImportTabContent apiKey="sk-lookup-key" />
          </ToastProvider>
        </ThemeProvider>,
      );

      const codexSection = await screen.findByRole("region", { name: /codex quick imports/i });

      await userEvent.click(
        within(codexSection).getByRole("button", { name: /copy import link/i }),
      );

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ccswitch://v1/import?"));
      });
      expect(
        within(codexSection).getByRole("button", { name: /import link copied/i }),
      ).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();

      const copiedUrl = String(writeText.mock.calls.at(-1)?.[0] ?? "");
      const parsed = new URL(copiedUrl);
      expect(parsed.searchParams.get("app")).toBe("codex");
      expect(parsed.searchParams.get("name")).toBe("Team Codex");
      expect(parsed.searchParams.get("apiKey")).toBe("sk-lookup-key");
      expect(parsed.searchParams.get("endpoint")).toMatch(/\/pro\/cs_codex\/v1$/);
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
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

  test("renders a stable skeleton while quick import cards are loading", () => {
    vi.mocked(globalThis.fetch).mockReturnValue(new Promise<Response>(() => {}));

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByTestId("quick-import-loading-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  test("filters quick import cards by the looked up API key permissions", async () => {
    window.localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({ apiBase: "http://localhost:3000", managementKey: "mgmt-test" }),
    );
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/ccswitch-import-configs")) {
        return new Response(
          JSON.stringify({
            "ccswitch-import-configs": [
              quickImportConfigs[0],
              {
                ...quickImportConfigs[0],
                id: "codex-blocked-model",
                "provider-name": "Blocked Codex",
                "default-model": "gpt-5.5",
                "model-mappings": [
                  {
                    "request-model": "gpt-5.5",
                    "target-model": "gpt-5.5",
                  },
                ],
              },
              quickImportConfigs[1],
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api-key-entries")) {
        return new Response(
          JSON.stringify({
            "api-key-entries": [
              {
                key: "sk-lookup-key",
                "allowed-channel-groups": ["pro"],
                "allowed-models": ["gpt-5.3-codex"],
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    const codexSection = await screen.findByRole("region", { name: /codex quick imports/i });

    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /blocked codex/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /claude quick imports/i })).not.toBeInTheDocument();
  });
});
