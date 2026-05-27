import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@/modules/providers/ProvidersPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  saveCodexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveOpenAIProviders: vi.fn(async (_configs: unknown[]) => ({})),
  patchOpenAIProviderDisabled: vi.fn(async (_index: number, _disabled: boolean) => ({})),
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async () => []),
  channelGroupsList: vi.fn(async () => []),
  proxiesList: vi.fn(async (): Promise<any[]> => []),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    providersApi: {
      ...mod.providersApi,
      getGeminiKeys: mocks.getGeminiKeys,
      getClaudeConfigs: mocks.getClaudeConfigs,
      getCodexConfigs: mocks.getCodexConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
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

vi.mock("@/lib/http/apis/api-keys", () => ({
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
  },
}));

vi.mock("@/lib/http/apis/channel-groups", () => ({
  channelGroupsApi: {
    list: mocks.channelGroupsList,
  },
}));

vi.mock("@/lib/http/apis/proxies", () => ({
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
    mocks.getVertexConfigs.mockReset();
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
    mocks.getVertexConfigs.mockImplementation(async () => []);
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
    expect(screen.getByText(/sk-ope\*\*\*7890/)).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Edit/ }));

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
    await user.click(screen.getByRole("button", { name: /Edit/ }));
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
    const providerSwitch = await screen.findByRole("switch", {
      name: /Enable provider OpenAI Main/i,
    });
    expect(providerSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(providerSwitch);

    await waitFor(() => {
      expect(mocks.patchOpenAIProviderDisabled).toHaveBeenCalledWith(0, true);
    });
    expect(mocks.saveOpenAIProviders).not.toHaveBeenCalled();
  });
});
