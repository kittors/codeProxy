import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  getBedrockConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  saveBedrockConfigs: vi.fn(async (_configs: unknown[]) => ({})),
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
      getBedrockConfigs: mocks.getBedrockConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      saveBedrockConfigs: mocks.saveBedrockConfigs,
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

describe("ProvidersPage Bedrock tab", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.saveBedrockConfigs.mockImplementation(async () => ({}));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("opens Bedrock route and saves a SigV4 credential", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/ai-providers/bedrock/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: /Bedrock/ })).toBeInTheDocument();
    expect(await screen.findByText("Add Bedrock configuration")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("e.g. Gemini Primary"), "AWS Production");

    await user.click(screen.getByRole("combobox", { name: "Bedrock authentication mode" }));
    await user.click(await screen.findByRole("option", { name: "AWS SigV4" }));

    await user.type(screen.getByPlaceholderText("AKIA..."), "AKIATEST");
    await user.type(screen.getByPlaceholderText("AWS secret access key"), "SECRET");
    await user.type(screen.getByPlaceholderText("Optional AWS session token"), "SESSION");
    await user.clear(screen.getByPlaceholderText("us-east-1"));
    await user.type(screen.getByPlaceholderText("us-east-1"), "eu-west-1");

    await user.click(screen.getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveBedrockConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "AWS Production",
          authMode: "sigv4",
          apiKey: "AKIATEST",
          accessKeyId: "AKIATEST",
          secretAccessKey: "SECRET",
          sessionToken: "SESSION",
          region: "eu-west-1",
        }),
      ]);
    });
  });
});
