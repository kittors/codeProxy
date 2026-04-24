import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@/modules/providers/ProvidersPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async () => []),
  channelGroupsList: vi.fn(async () => []),
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

describe("ProvidersPage openai tab", () => {
  beforeEach(() => {
    mocks.getGeminiKeys.mockReset();
    mocks.getClaudeConfigs.mockReset();
    mocks.getCodexConfigs.mockReset();
    mocks.getVertexConfigs.mockReset();
    mocks.getOpenAIProviders.mockReset();
    mocks.getEntityStats.mockReset();
    mocks.apiKeyEntriesList.mockReset();
    mocks.channelGroupsList.mockReset();

    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
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
});
