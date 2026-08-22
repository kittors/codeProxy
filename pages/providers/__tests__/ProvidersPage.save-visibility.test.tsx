import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

/**
 * A save that reports success and leaves no card is the worst outcome this page
 * can produce: the operator believes the channel exists. Each case here is a way
 * that used to happen.
 */

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getClineConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCommandCodeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getBedrockConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  saveGeminiKeys: vi.fn(async (_configs: unknown[]) => ({})),
  saveClaudeConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveCodexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveVertexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
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
      getCommandCodeConfigs: mocks.getCommandCodeConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
      getBedrockConfigs: mocks.getBedrockConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      saveGeminiKeys: mocks.saveGeminiKeys,
      saveClaudeConfigs: mocks.saveClaudeConfigs,
      saveCodexConfigs: mocks.saveCodexConfigs,
      saveVertexConfigs: mocks.saveVertexConfigs,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
    },
  };
});

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeyEntriesApi: { list: mocks.apiKeyEntriesList },
}));

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: { list: mocks.channelGroupsList },
}));

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: { list: mocks.proxiesList },
}));

const renderAt = (path: string) =>
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

describe("ProvidersPage save keeps the channel visible", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    vi.clearAllMocks();

    for (const getter of [
      mocks.getGeminiKeys,
      mocks.getClaudeConfigs,
      mocks.getCodexConfigs,
      mocks.getOpenCodeGoConfigs,
      mocks.getClineConfigs,
      mocks.getOllamaCloudConfigs,
      mocks.getCommandCodeConfigs,
      mocks.getVertexConfigs,
      mocks.getBedrockConfigs,
      mocks.getOpenAIProviders,
    ]) {
      getter.mockImplementation(async () => []);
    }
    mocks.saveGeminiKeys.mockImplementation(async () => ({}));
    mocks.saveClaudeConfigs.mockImplementation(async () => ({}));
    mocks.saveCodexConfigs.mockImplementation(async () => ({}));
    mocks.saveVertexConfigs.mockImplementation(async () => ({}));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  // The Codex base URL is optional — empty means the default Codex endpoint —
  // so the editor must not block on it, and the saved row must reach the PUT.
  test("saves a Codex channel that has no base URL", async () => {
    // A backend that honours the write: whatever the PUT persisted is what the
    // follow-up GET returns. Before the fix the row was dropped for having no
    // base-url, so this GET replayed the old list and the new card vanished.
    let persisted: ProviderSimpleConfig[] = [];
    mocks.saveCodexConfigs.mockImplementation(async (configs: unknown[]) => {
      persisted = configs as ProviderSimpleConfig[];
      return {};
    });
    mocks.getCodexConfigs.mockImplementation(async () => persisted);

    const user = userEvent.setup();
    renderAt("/access/ai-providers/codex/new");

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "Codex Default Endpoint",
    );
    await user.type(
      within(dialog).getByPlaceholderText("Paste API Key"),
      "sk-codex-no-base-url",
    );
    await user.click(within(dialog).getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mocks.saveCodexConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Codex Default Endpoint",
          apiKey: "sk-codex-no-base-url",
        }),
      ]);
    });
    const saved = mocks.saveCodexConfigs.mock
      .calls[0]?.[0] as ProviderSimpleConfig[];
    expect(saved[0]).not.toHaveProperty("baseUrl");
    expect(await screen.findByText("Codex Default Endpoint")).toBeInTheDocument();
  });

  // Vertex rows without a base URL are dropped upstream, so the editor has to
  // say so rather than let the write report success and lose the channel.
  test("refuses a Vertex channel without a base URL instead of losing it", async () => {
    const user = userEvent.setup();
    renderAt("/access/ai-providers/vertex/new");

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "Vertex No Endpoint",
    );
    await user.type(
      within(dialog).getByPlaceholderText("Paste API Key"),
      "sk-vertex-no-base-url",
    );
    await user.click(within(dialog).getByRole("button", { name: /^Save$/ }));

    expect(
      await within(dialog).findByText("Base URL cannot be empty"),
    ).toBeInTheDocument();
    expect(mocks.saveVertexConfigs).not.toHaveBeenCalled();
  });

  // Gemini deduplicates on the api key, so a second copy would be dropped by the
  // backend while the UI said "saved".
  test("refuses a Gemini credential that is already configured", async () => {
    mocks.getGeminiKeys.mockImplementation(async () => [
      { name: "Gemini Main", apiKey: "sk-gemini-existing" },
    ]);
    const user = userEvent.setup();
    renderAt("/access/ai-providers/gemini/new");

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "Gemini Duplicate",
    );
    await user.type(
      within(dialog).getByPlaceholderText("Paste API Key"),
      "sk-gemini-existing",
    );
    await user.click(within(dialog).getByRole("button", { name: /^Save$/ }));

    expect(
      await within(dialog).findByText(/already used by channel "Gemini Main"/),
    ).toBeInTheDocument();
    expect(mocks.saveGeminiKeys).not.toHaveBeenCalled();
  });

  // Renaming a row must not read as a collision with itself.
  test("allows re-saving an existing credential unchanged", async () => {
    mocks.getGeminiKeys.mockImplementation(async () => [
      { name: "Gemini Main", apiKey: "sk-gemini-existing" },
    ]);
    const user = userEvent.setup();
    renderAt("/access/ai-providers/gemini/0");

    const dialog = await screen.findByRole("dialog");
    const nameInput = within(dialog).getByPlaceholderText(
      "e.g. Gemini Primary",
    );
    await user.clear(nameInput);
    await user.type(nameInput, "Gemini Renamed");
    await user.click(within(dialog).getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mocks.saveGeminiKeys).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Gemini Renamed",
          apiKey: "sk-gemini-existing",
        }),
      ]);
    });
  });
});
