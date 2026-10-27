import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { rememberChannelCoolingSupport } from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";

// 渠道的 429 冷却开关：只在后端声明能保存时出现，选择随整表保存一起提交。
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
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async (): Promise<unknown[]> => []),
  channelGroupsList: vi.fn(async (): Promise<unknown[]> => []),
  proxiesList: vi.fn(async (): Promise<unknown[]> => []),
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
    },
    usageApi: { ...mod.usageApi, getEntityStats: mocks.getEntityStats },
  };
});

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeyEntriesApi: { list: mocks.apiKeyEntriesList },
}));

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: { list: mocks.channelGroupsList },
}));

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: { listSelectable: mocks.proxiesList },
}));

const COOLING = "429 / 5xx cooldown";

const renderPage = (path = "/access/ai-providers") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

const openCodexRequestTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("tab", { name: /Codex/ }));
  expect(await screen.findByText("Relay Codex")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /More actions/i }));
  await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
  expect(await screen.findByText("Edit Codex configuration")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /Request/i }));
};

describe("ProvidersPage channel cooling switch", () => {
  beforeEach(() => {
    localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    for (const mock of Object.values(mocks)) mock.mockReset();
    for (const getter of [
      mocks.getGeminiKeys,
      mocks.getClaudeConfigs,
      mocks.getCodexConfigs,
      mocks.getOpenCodeGoConfigs,
      mocks.getClineConfigs,
      mocks.getOllamaCloudConfigs,
      mocks.getVertexConfigs,
      mocks.getBedrockConfigs,
      mocks.getOpenAIProviders,
      mocks.apiKeyEntriesList,
      mocks.channelGroupsList,
      mocks.proxiesList,
    ]) {
      getter.mockImplementation(async () => []);
    }
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.saveCodexConfigs.mockImplementation(async () => ({}));
    mocks.saveOpenAIProviders.mockImplementation(async () => ({}));
    mocks.getCodexConfigs.mockImplementation(async () => [
      { name: "Relay Codex", apiKey: "sk-relay-codex-1234567890", disableCooling: true },
    ]);
  });

  test("is not offered on a backend that cannot store it", async () => {
    rememberChannelCoolingSupport({ "codex-api-key": [] });
    const user = userEvent.setup();
    renderPage();
    await openCodexRequestTab(user);

    expect(screen.queryByRole("combobox", { name: COOLING })).not.toBeInTheDocument();
  });

  test("shows a key's override and saves it back to follow the global setting", async () => {
    rememberChannelCoolingSupport({ capabilities: { "disable-cooling": true } });
    const user = userEvent.setup();
    renderPage();
    await openCodexRequestTab(user);

    const select = screen.getByRole("combobox", { name: COOLING });
    expect(select).toHaveTextContent("Cooldown off");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Follow global setting" }));
    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(mocks.saveCodexConfigs).toHaveBeenCalledTimes(1));
    const saved = mocks.saveCodexConfigs.mock.calls[0]?.[0]?.[0];
    expect(saved).toMatchObject({ name: "Relay Codex", apiKey: "sk-relay-codex-1234567890" });
    expect(saved).not.toHaveProperty("disableCooling");
  });

  test("saves an OpenAI-compatible provider with cooling turned off", async () => {
    rememberChannelCoolingSupport({ capabilities: { "disable-cooling": true } });
    mocks.getOpenAIProviders.mockImplementation(async () => [
      {
        name: "Relay",
        baseUrl: "https://relay.example/v1",
        apiKeyEntries: [{ apiKey: "sk-relay-1234567890" }],
        models: [{ name: "glm-5" }],
      },
    ]);
    const user = userEvent.setup();
    renderPage("/access/ai-providers/openai");

    expect(await screen.findByText("Relay")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /More actions/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
    const dialog = await screen.findByRole("dialog");

    const select = within(dialog).getByRole("combobox", { name: COOLING });
    expect(select).toHaveTextContent("Follow global setting");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Cooldown off" }));
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenAIProviders).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Relay", disableCooling: true }),
      ]);
    });
  });
});
