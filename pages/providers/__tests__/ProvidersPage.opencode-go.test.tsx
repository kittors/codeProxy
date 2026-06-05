import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

type MockApiCallResult = {
  statusCode: number;
  header: Record<string, string[]>;
  bodyText: string;
  body: unknown;
};

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getBedrockConfigs: vi.fn(async () => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<any[]> => []),
  getOpenAIProviders: vi.fn(async () => []),
  saveOpenCodeGoConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  apiCallRequest: vi.fn(
    async (_payload: unknown): Promise<MockApiCallResult> => ({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: {
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
          { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
          { id: "kimi-k2.6", object: "model", owned_by: "opencode" },
        ],
      },
    }),
  ),
  getEntityStats: vi.fn(async () => ({ source: [] })),
  apiKeyEntriesList: vi.fn(async () => []),
  channelGroupsList: vi.fn(async () => []),
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
          { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
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

  test("keeps failed OpenCode Go saves out of the rendered provider list", async () => {
    const user = userEvent.setup();
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "Existing OpenCode Go",
        apiKey: "sk-existing-opencode-go",
      },
    ]);
    mocks.saveOpenCodeGoConfigs.mockRejectedValue(new Error("channel name already used"));

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

    expect(await screen.findByText("Existing OpenCode Go")).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: /Add OpenCode Go configuration/i });

    await user.type(within(dialog).getByPlaceholderText("e.g. Gemini Primary"), "New OpenCode Go");
    await user.type(within(dialog).getByPlaceholderText(/Paste API Key/i), "sk-new-opencode-go");
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({ name: "Existing OpenCode Go" }),
        expect.objectContaining({ name: "New OpenCode Go" }),
      ]);
    });
    expect(screen.queryByText("New OpenCode Go")).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /Add OpenCode Go configuration/i }),
    ).toBeInTheDocument();
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

  test("offers allowed multimodal OpenCode Go models as vision fallback options from string api-call body", async () => {
    const user = userEvent.setup();
    mocks.apiCallRequest.mockImplementation(async () => ({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: JSON.stringify({
        object: "list",
        data: [
          { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
          { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
          { id: "qwen3.6-plus", object: "model", owned_by: "opencode" },
          { id: "mimo-v2-omni", object: "model", owned_by: "opencode" },
          { id: "minimax-m2.5", object: "model", owned_by: "opencode" },
        ],
      }),
    }));

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
    await user.click(within(dialog).getByRole("tab", { name: /Models/i }));
    await user.click(await within(dialog).findByRole("checkbox", { name: /minimax-m2.5/i }));

    await user.click(within(dialog).getByRole("tab", { name: /Request/i }));
    const fallback = await within(dialog).findByRole("combobox", {
      name: /Vision fallback model/i,
    });
    await user.click(fallback);

    expect(await screen.findByRole("option", { name: /qwen3\.5-plus/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /qwen3\.6-plus/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /deepseek-v4-flash/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /mimo-v2-omni/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /minimax-m2\.5/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /mimo-v2-omni/i }));

    await user.click(within(dialog).getByRole("tab", { name: /Basic/i }));
    await user.type(within(dialog).getByPlaceholderText("e.g. Gemini Primary"), "OpenCode Go");
    await user.type(within(dialog).getByPlaceholderText(/Paste API Key/i), "sk-opencode-go");
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenCode Go",
          apiKey: "sk-opencode-go",
          excludedModels: ["minimax-m2.5"],
          visionFallbackModel: "mimo-v2-omni",
        }),
      ]);
    });
  });
});

describe("mergeOpenCodeGoUsage", () => {
  test("returns incoming when existing is empty", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const incoming = [{ type: "rolling", label: "Rolling", percentage: 50, resets_in: "30m" }];
    expect(mergeOpenCodeGoUsage([], incoming)).toEqual(incoming);
  });

  test("returns existing when incoming is empty", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [{ type: "weekly", label: "Weekly", percentage: 30, resets_in: "3d" }];
    expect(mergeOpenCodeGoUsage(existing, [])).toEqual(existing);
  });

  test("overwrites matching types and preserves non-matching types", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [
      { type: "rolling", label: "Rolling", percentage: 50, resets_in: "30m" },
      { type: "weekly", label: "Weekly", percentage: 30, resets_in: "3d" },
      { type: "monthly", label: "Monthly", percentage: 10, resets_in: "20d" },
    ];
    const incoming = [{ type: "rolling", label: "Rolling", percentage: 80, resets_in: "25m" }];
    const result = mergeOpenCodeGoUsage(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result.find((i) => i.type === "rolling")?.percentage).toBe(80);
    expect(result.find((i) => i.type === "weekly")?.percentage).toBe(30);
    expect(result.find((i) => i.type === "monthly")?.percentage).toBe(10);
  });

  test("handles case-insensitive type matching", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [{ type: "Rolling", label: "Rolling", percentage: 50, resets_in: "30m" }];
    const incoming = [{ type: "rolling", label: "Rolling", percentage: 75, resets_in: "25m" }];
    const result = mergeOpenCodeGoUsage(existing, incoming);

    expect(result).toHaveLength(1);
    expect(result[0].percentage).toBe(75);
  });

  test("preserves incoming order with appended preserved items", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [
      { type: "monthly", label: "Monthly", percentage: 10, resets_in: "20d" },
      { type: "weekly", label: "Weekly", percentage: 30, resets_in: "3d" },
    ];
    const incoming = [{ type: "rolling", label: "Rolling", percentage: 80, resets_in: "25m" }];
    const result = mergeOpenCodeGoUsage(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("rolling");
    expect(result[1].type).toBe("monthly");
    expect(result[2].type).toBe("weekly");
  });
});
