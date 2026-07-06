import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getClineConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getBedrockConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  saveCodexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveOpenAIProviders: vi.fn(async (_configs: unknown[]) => ({})),
  patchOpenAIProviderDisabled: vi.fn(async (_index: number, _disabled: boolean) => ({})),
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async (): Promise<unknown[]> => []),
  channelGroupsList: vi.fn(async (): Promise<unknown[]> => []),
  proxiesList: vi.fn(async (): Promise<any[]> => []),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    providersApi: {
      ...mod.providersApi,
      getGeminiKeys: mocks.getGeminiKeys,
      getClaudeConfigs: mocks.getClaudeConfigs,
      getCodexConfigs: mocks.getCodexConfigs,
      getOpenCodeGoConfigs: mocks.getOpenCodeGoConfigs,
      getClineConfigs: mocks.getClineConfigs,
      getOllamaCloudConfigs: mocks.getOllamaCloudConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
      getBedrockConfigs: mocks.getBedrockConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      saveCodexConfigs: mocks.saveCodexConfigs,
      saveOpenAIProviders: mocks.saveOpenAIProviders,
      patchOpenAIProviderDisabled: mocks.patchOpenAIProviderDisabled,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
    },
  };
});

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: {
    list: mocks.channelGroupsList,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: {
    list: mocks.proxiesList,
  },
}));

describe("ProvidersPage openai tab", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.getGeminiKeys.mockReset();
    mocks.getClaudeConfigs.mockReset();
    mocks.getCodexConfigs.mockReset();
    mocks.getOpenCodeGoConfigs.mockReset();
    mocks.getClineConfigs.mockReset();
    mocks.getOllamaCloudConfigs.mockReset();
    mocks.getVertexConfigs.mockReset();
    mocks.getBedrockConfigs.mockReset();
    mocks.getOpenAIProviders.mockReset();
    mocks.saveCodexConfigs.mockReset();
    mocks.saveOpenAIProviders.mockReset();
    mocks.patchOpenAIProviderDisabled.mockReset();
    mocks.getEntityStats.mockReset();
    mocks.apiKeyEntriesList.mockReset();
    mocks.channelGroupsList.mockReset();
    mocks.proxiesList.mockReset();

    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => []);
    mocks.getClineConfigs.mockImplementation(async () => []);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.saveCodexConfigs.mockImplementation(async () => ({}));
    mocks.saveOpenAIProviders.mockImplementation(async () => ({}));
    mocks.patchOpenAIProviderDisabled.mockImplementation(async () => ({}));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => [
      {
        id: "hk",
        name: "Hong Kong",
        url: "http://hk.example:7890",
        enabled: true,
      },
      {
        id: "jp",
        name: "Japan",
        url: "http://jp.example:7890",
        enabled: true,
      },
    ]);
    mocks.getEntityStats.mockImplementation(
      async () =>
        ({
          source: [
            {
              entity_name: "sk-openai-provider-1234567890",
              requests: 10,
              failed: 2,
            },
          ],
        }) as any,
    );
    mocks.getOpenAIProviders.mockImplementation(
      async () =>
        [
          {
            name: "OpenAI Main",
            baseUrl: "https://example.com/v1",
            prefix: "oa",
            testModel: "gpt-4.1",
            apiKeyEntries: [{ apiKey: "sk-openai-provider-1234567890", proxyUrl: "" }],
            models: [{ name: "gpt-4.1" }],
          },
        ] as any,
    );
  });

  test("loads provider counts on first render and hides zero badges", async () => {
    mocks.getCodexConfigs.mockImplementation(async () => [
      { name: "Codex 1", apiKey: "sk-codex-1" },
      { name: "Codex 2", apiKey: "sk-codex-2" },
    ]);
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      { name: "OpenCode Go", apiKey: "sk-opencode-go" },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const codexTab = await screen.findByRole("tab", { name: /Codex/ });
    const openCodeGoTab = screen.getByRole("tab", { name: /OpenCode Go/ });
    const geminiTab = screen.getByRole("tab", { name: /Gemini/ });

    expect(within(codexTab).getByText("2")).toBeInTheDocument();
    expect(within(openCodeGoTab).getByText("1")).toBeInTheDocument();
    expect(within(geminiTab).queryByText("0")).not.toBeInTheDocument();
  });

  test("shows skeleton cards instead of the card loading overlay before the first empty result", async () => {
    localStorage.setItem("providers-page:tab", "gemini");
    let resolveGemini: (value: ProviderSimpleConfig[]) => void = () => {};
    mocks.getGeminiKeys.mockImplementationOnce(
      () =>
        new Promise<ProviderSimpleConfig[]>((resolve) => {
          resolveGemini = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("providers-list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveGemini([]);
    expect(await screen.findByText("No configuration")).toBeInTheDocument();
  });

  test("keeps existing provider cards visible during toolbar refresh", async () => {
    const user = userEvent.setup();
    const geminiProvider: ProviderSimpleConfig = {
      name: "Gemini Main",
      apiKey: "sk-gemini-main",
    };
    localStorage.setItem("providers-page:tab", "gemini");
    mocks.getGeminiKeys.mockImplementationOnce(async () => [geminiProvider]);

    render(
      <MemoryRouter initialEntries={["/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Gemini Main")).toBeInTheDocument();

    let resolveRefresh: (value: ProviderSimpleConfig[]) => void = () => {};
    mocks.getGeminiKeys.mockImplementationOnce(
      () =>
        new Promise<ProviderSimpleConfig[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    await user.click(screen.getByRole("button", { name: /Refresh|刷新/ }));

    expect(screen.getByText("Gemini Main")).toBeInTheDocument();
    expect(screen.queryByTestId("providers-list-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveRefresh([geminiProvider]);
    await waitFor(() => {
      expect(mocks.getGeminiKeys).toHaveBeenCalledTimes(2);
    });
  });

  test("renders openai provider card with masked key and aggregated status", async () => {
    render(
      <MemoryRouter initialEntries={["/ai-providers/openai"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("OpenAI Main")).toBeInTheDocument();
    expect(screen.getByText("prefix: oa")).toBeInTheDocument();
    expect(screen.getByText("baseUrl: https://example.com/v1")).toBeInTheDocument();
    expect(screen.getAllByText(/sk-ope\*\*\*7890/).length).toBeGreaterThan(0);
    expect(screen.getByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("testModel: gpt-4.1")).toBeInTheDocument();
  });

  test("saves selected proxy pool binding for provider keys", async () => {
    const user = userEvent.setup();
    mocks.getCodexConfigs.mockImplementation(
      async () =>
        [
          {
            name: "Codex Main",
            apiKey: "sk-codex-provider-1234567890",
            proxyId: "hk",
          },
        ] as any,
    );

    render(
      <MemoryRouter initialEntries={["/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));

    expect(await screen.findByText("Edit Codex configuration")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Request/i }));
    await user.click(screen.getByRole("combobox", { name: "Proxy pool binding" }));
    await user.click(await screen.findByRole("option", { name: /Japan/ }));
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveCodexConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Codex Main",
          apiKey: "sk-codex-provider-1234567890",
          proxyId: "jp",
        }),
      ]);
    });
  });

  test("toggles an OpenAI Compatible key entry without removing it", async () => {
    const user = userEvent.setup();
    const provider = {
      name: "OpenAI Main",
      baseUrl: "https://example.com/v1",
      apiKeyEntries: [
        { apiKey: "sk-openai-enabled-1234567890" },
        { apiKey: "sk-openai-disabled-1234567890", disabled: true },
      ],
      models: [{ name: "gpt-4.1" }],
    } as any;
    mocks.getOpenAIProviders.mockImplementation(async () => [provider] as any);

    render(
      <MemoryRouter initialEntries={["/ai-providers/openai"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("OpenAI Main")).toBeInTheDocument();
    const enabledSwitch = (
      await screen.findAllByRole("switch", { name: /Enable key entry 1/i })
    )[0];
    const disabledSwitch = (
      await screen.findAllByRole("switch", { name: /Enable key entry 2/i })
    )[0];
    expect(enabledSwitch).toHaveAttribute("aria-checked", "true");
    expect(disabledSwitch).toHaveAttribute("aria-checked", "false");

    await user.click(enabledSwitch);

    await waitFor(() => {
      expect(mocks.saveOpenAIProviders).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenAI Main",
          apiKeyEntries: [
            expect.objectContaining({
              apiKey: "sk-openai-enabled-1234567890",
              disabled: true,
            }),
            expect.objectContaining({
              apiKey: "sk-openai-disabled-1234567890",
              disabled: true,
            }),
          ],
        }),
      ]);
    });
  });

  test("saves an OpenAI Compatible provider without API key entries", async () => {
    const user = userEvent.setup();
    const provider = {
      name: "Keyless OpenAI",
      baseUrl: "https://keyless.example.com/v1",
      models: [{ name: "gpt-compatible" }],
    } as any;
    mocks.getOpenAIProviders.mockImplementation(async () => [provider] as any);

    render(
      <MemoryRouter initialEntries={["/ai-providers/openai"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Keyless OpenAI")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
    expect(await screen.findByText("Edit OpenAI-compatible provider")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenAIProviders).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Keyless OpenAI",
          baseUrl: "https://keyless.example.com/v1",
          models: [{ name: "gpt-compatible" }],
        }),
      ]);
    });
    expect(mocks.saveOpenAIProviders.mock.calls[0]?.[0]?.[0]).not.toHaveProperty("apiKeyEntries");
  });

  test("toggles an OpenAI Compatible provider without removing keys", async () => {
    const user = userEvent.setup();
    const provider = {
      name: "OpenAI Main",
      baseUrl: "https://example.com/v1",
      apiKeyEntries: [
        { apiKey: "sk-openai-enabled-1234567890" },
        { apiKey: "sk-openai-disabled-1234567890", disabled: true },
      ],
      models: [{ name: "gpt-4.1" }],
    } as any;
    mocks.getOpenAIProviders.mockImplementation(async () => [provider] as any);

    render(
      <MemoryRouter initialEntries={["/ai-providers/openai"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("OpenAI Main")).toBeInTheDocument();

    const menuButton = await screen.findByLabelText("More actions");
    await user.click(menuButton);

    const disableItem = await screen.findByText("Disable");
    await user.click(disableItem);

    await waitFor(() => {
      expect(mocks.patchOpenAIProviderDisabled).toHaveBeenCalledWith(0, true);
    });
    expect(mocks.saveOpenAIProviders).not.toHaveBeenCalled();
  });
});
