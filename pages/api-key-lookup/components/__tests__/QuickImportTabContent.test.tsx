import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { QuickImportTabContent } from "../QuickImportTabContent";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

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
      {
        "request-model": "deepseek-v4-flash",
        "target-model": "deepseek-chat",
      },
    ],
    "codex-model-catalog-filename": "cc-switch-model-catalog.json",
    "codex-model-catalog": {
      models: [
        {
          slug: "gpt-5.3-codex",
          display_name: "gpt-5.3-codex",
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
          display_name: "deepseek-v4-flash",
        },
      ],
    },
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
    id: "gemini-team",
    "client-type": "gemini",
    "provider-name": "Team Gemini",
    note: "",
    "default-model": "gemini-2.5-pro",
    "model-mappings": [],
    "allowed-channel-groups": [],
    "route-path": "/gemini/cs_gemini",
    "endpoint-path": "",
    "usage-auto-interval": 60,
  },
  {
    id: "opencode-team",
    "client-type": "opencode",
    "provider-name": "Team OpenCode",
    note: "",
    "default-model": "kimi-k2",
    "model-mappings": [{ "request-model": "kimi-k2", "target-model": "kimi-k2" }],
    "allowed-channel-groups": ["pro"],
    "route-path": "/pro/cs_opencode",
    "endpoint-path": "/v1",
    "usage-auto-interval": 60,
  },
];

const decodeConfigFromImportUrl = (url: string) => {
  const encoded = new URL(url).searchParams.get("config");
  expect(encoded).toBeTruthy();
  const binary = atob(encoded!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
};

describe("QuickImportTabContent", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ "ccswitch-import-configs": quickImportConfigs }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("groups the cards by app and launches the selected preset", async () => {
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

    const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });
    const claudeSection = await screen.findByRole("region", { name: /claude code quick imports/i });
    const geminiSection = await screen.findByRole("region", { name: /gemini cli quick imports/i });
    const opencodeSection = await screen.findByRole("region", { name: /opencode quick imports/i });

    expect(
      screen
        .getAllByRole("region", { name: /quick imports$/i })
        .map((region) => region.getAttribute("aria-label")),
    ).toEqual([
      "Claude Code quick imports",
      "Codex quick imports",
      "Gemini CLI quick imports",
      "OpenCode quick imports",
    ]);
    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(within(claudeSection).getByRole("button", { name: /team claude/i })).toBeInTheDocument();
    expect(within(geminiSection).getByRole("button", { name: /team gemini/i })).toBeInTheDocument();
    // The group heading and the card both carry the app's mark.
    expect(within(opencodeSection).getAllByTestId("ccswitch-client-icon-opencode")).toHaveLength(2);

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
    expect(parsed.searchParams.get("icon")).toBe("openai");
    expect(parsed.searchParams.has("apiFormat")).toBe(false);
    const config = decodeConfigFromImportUrl(openedUrl);
    expect(Object.keys(config)).toEqual(["auth", "config"]);
    expect(config.auth).toEqual({ OPENAI_API_KEY: "sk-lookup-key" });
    // The backend catalog's default effort for the default model, without the catalog itself.
    expect(config.config).toContain('model_reasoning_effort = "medium"');
    expect(config.config).not.toContain("model_catalog_json");

    await userEvent.click(within(opencodeSection).getByRole("button", { name: /team opencode/i }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(2));
    const opencode = new URL(String(openSpy.mock.calls.at(-1)?.[0] ?? ""));
    expect(opencode.searchParams.get("app")).toBe("opencode");
    expect(opencode.searchParams.get("endpoint")).toMatch(/\/pro\/cs_opencode\/v1$/);
    expect(opencode.searchParams.get("model")).toBe("kimi-k2");
    expect(opencode.searchParams.has("enabled")).toBe(false);
  });

  test("links built from the session cache keep the Codex reasoning effort", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const first = render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );
    await screen.findByRole("region", { name: /^codex quick imports/i });
    first.unmount();

    // The second visit renders from the cache while the request never answers.
    vi.mocked(globalThis.fetch).mockReturnValue(new Promise<Response>(() => {}));
    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );
    const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });
    await userEvent.click(within(codexSection).getByRole("button", { name: /team codex/i }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    const config = decodeConfigFromImportUrl(String(openSpy.mock.calls.at(-1)?.[0] ?? ""));
    expect(config.config).toContain('model_reasoning_effort = "medium"');
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

      const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });

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
      expect(decodeConfigFromImportUrl(copiedUrl)).toEqual({
        auth: { OPENAI_API_KEY: "sk-lookup-key" },
        config: expect.stringContaining('model = "gpt-5.3-codex"'),
      });
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  test("does not expose a separate Codex model catalog download action", async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });
    expect(
      within(codexSection).queryByRole("button", { name: /download codex model catalog/i }),
    ).not.toBeInTheDocument();
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

    const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });

    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /quick imports$/i })).toHaveLength(1);
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

  test("always loads presets from the public endpoint even when admin auth is present", async () => {
    window.localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://localhost:3000",
        managementKey: "mgmt-test",
        expiresAt: Date.now() + 60_000,
      }),
    );

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? "GET").toUpperCase();
      if (url.includes("/public/ccswitch-import-configs") && method === "POST") {
        return new Response(
          JSON.stringify({ "ccswitch-import-configs": [quickImportConfigs[0]] }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuickImportTabContent apiKey="sk-lookup-key" />
        </ToastProvider>
      </ThemeProvider>,
    );

    const codexSection = await screen.findByRole("region", { name: /^codex quick imports/i });
    expect(within(codexSection).getByRole("button", { name: /team codex/i })).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalled();
    const calledUrls = fetchMock.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: String(init?.method ?? "GET").toUpperCase(),
    }));
    expect(
      calledUrls.some(
        (call) =>
          call.url.includes("/public/ccswitch-import-configs") && call.method === "POST",
      ),
    ).toBe(true);
    expect(
      calledUrls.some(
        (call) =>
          call.url.includes("/ccswitch-import-configs") &&
          !call.url.includes("/public/") &&
          call.method === "GET",
      ),
    ).toBe(false);
    expect(calledUrls.some((call) => call.url.includes("/api-key-entries"))).toBe(false);
  });

  test("renders EmptyState when the public endpoint returns no presets", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ "ccswitch-import-configs": [] }), {
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

    expect(await screen.findByText(/no quick import presets available/i)).toBeInTheDocument();
    expect(screen.getByText(/this api key has no matching import cards/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /quick imports$/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-import-loading-skeleton")).not.toBeInTheDocument();
  });
});
