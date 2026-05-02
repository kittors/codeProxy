import { render, screen, waitFor, within } from "@testing-library/react";
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
  getOpenCodeGoConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  saveOpenCodeGoConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  apiCallRequest: vi.fn(async (_payload: unknown) => ({
    statusCode: 200,
    header: {},
    bodyText: "",
    body: {
      object: "list",
      data: [
        { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
        { id: "kimi-k2.6", object: "model", owned_by: "opencode" },
      ],
    },
  })),
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
      getOpenCodeGoConfigs: mocks.getOpenCodeGoConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      saveOpenCodeGoConfigs: mocks.saveOpenCodeGoConfigs,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
    },
    apiCallApi: {
      ...mod.apiCallApi,
      request: mocks.apiCallRequest,
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

describe("ProvidersPage OpenCode Go tab", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.saveOpenCodeGoConfigs.mockImplementation(async () => ({}));
    mocks.apiCallRequest.mockImplementation(async () => ({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
          { id: "kimi-k2.6", object: "model", owned_by: "opencode" },
        ],
      },
    }));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("opens OpenCode Go route and saves a key without requiring Base URL", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/ai-providers/opencode-go/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("tab", { name: /OpenCode Go/ })).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: /Add OpenCode Go configuration/i });

    expect(within(dialog).queryByText("Base URL")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Models (optional)")).not.toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText("e.g. Gemini Primary"), "OpenCode Go");
    await user.type(within(dialog).getByPlaceholderText(/Paste API Key/i), "sk-opencode-go");
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenCode Go",
          apiKey: "sk-opencode-go",
        }),
      ]);
    });
    expect(mocks.saveOpenCodeGoConfigs.mock.calls[0][0][0]).not.toHaveProperty("baseUrl");
  });

  test("uses fixed tabs and saves OpenCode Go model exclusions from fetched models", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/ai-providers/opencode-go/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", { name: /Add OpenCode Go configuration/i });
    expect(within(dialog).getByRole("tab", { name: /Basic/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /Request/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /Models/i })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /Models/i }));

    await waitFor(() => {
      expect(mocks.apiCallRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          url: "https://opencode.ai/zen/go/v1/models",
        }),
      );
    });

    const deepseek = await within(dialog).findByRole("checkbox", { name: /deepseek-v4-flash/i });
    expect(deepseek).toBeChecked();
    await user.click(deepseek);

    await user.click(within(dialog).getByRole("tab", { name: /Basic/i }));
    await user.type(within(dialog).getByPlaceholderText("e.g. Gemini Primary"), "OpenCode Go");
    await user.type(within(dialog).getByPlaceholderText(/Paste API Key/i), "sk-opencode-go");
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenCode Go",
          apiKey: "sk-opencode-go",
          excludedModels: ["deepseek-v4-flash"],
        }),
      ]);
    });
    expect(mocks.saveOpenCodeGoConfigs.mock.calls[0][0][0]).not.toHaveProperty("models");
  });
});
