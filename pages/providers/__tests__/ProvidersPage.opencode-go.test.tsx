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

type MockOpenCodeGoUsageResponse = {
  workspace_id: string;
  usage: {
    type: string;
    label: string;
    percentage: number;
    resets_in: string;
  }[];
};

type MockEntityStatsResponse = {
  source: { entity_name: string; requests: number; failed: number }[];
};

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getBedrockConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<any[]> => []),
  getClineConfigs: vi.fn(async (): Promise<any[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  queryOpenCodeGoUsage: vi.fn(async () => ({
    workspace_id: "workspace-1",
    usage: [
      { type: "rolling", label: "Rolling", percentage: 25, resets_in: "30m" },
    ],
  })),
  saveOpenCodeGoConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveClineConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  saveOllamaCloudConfigs: vi.fn(async (_configs: unknown[]) => ({})),
  patchOpenCodeGoConfig: vi.fn(
    async (_index: number, _config: unknown) => ({}),
  ),
  patchClineConfig: vi.fn(async (_index: number, _config: unknown) => ({})),
  patchOllamaCloudConfig: vi.fn(
    async (_index: number, _config: unknown) => ({}),
  ),
  patchOpenCodeGoExcludedModels: vi.fn(
    async (_index: number, _models: string[]) => ({}),
  ),
  patchClineExcludedModels: vi.fn(
    async (_index: number, _models: string[]) => ({}),
  ),
  patchOllamaCloudExcludedModels: vi.fn(
    async (_index: number, _models: string[]) => ({}),
  ),
  getModelDefinitions: vi.fn(async (_channel?: string) => [
    { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
    { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
    { id: "kimi-k2.6", object: "model", owned_by: "opencode" },
  ]),
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
          { id: "qwen3.7-max", object: "model", owned_by: "opencode" },
        ],
      },
    }),
  ),
  getEntityStats: vi.fn(async (): Promise<MockEntityStatsResponse> => ({
    source: [],
  })),
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
      getVertexConfigs: mocks.getVertexConfigs,
      getBedrockConfigs: mocks.getBedrockConfigs,
      getOpenCodeGoConfigs: mocks.getOpenCodeGoConfigs,
      getClineConfigs: mocks.getClineConfigs,
      getOllamaCloudConfigs: mocks.getOllamaCloudConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
      queryOpenCodeGoUsage: mocks.queryOpenCodeGoUsage,
      saveOpenCodeGoConfigs: mocks.saveOpenCodeGoConfigs,
      saveClineConfigs: mocks.saveClineConfigs,
      saveOllamaCloudConfigs: mocks.saveOllamaCloudConfigs,
      patchOpenCodeGoConfig: mocks.patchOpenCodeGoConfig,
      patchClineConfig: mocks.patchClineConfig,
      patchOllamaCloudConfig: mocks.patchOllamaCloudConfig,
      patchOpenCodeGoExcludedModels: mocks.patchOpenCodeGoExcludedModels,
      patchClineExcludedModels: mocks.patchClineExcludedModels,
      patchOllamaCloudExcludedModels: mocks.patchOllamaCloudExcludedModels,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
    },
    apiCallApi: {
      ...mod.apiCallApi,
      request: mocks.apiCallRequest,
    },
    authFilesApi: {
      ...mod.authFilesApi,
      getModelDefinitions: mocks.getModelDefinitions,
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
    mocks.getClineConfigs.mockImplementation(async () => []);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.queryOpenCodeGoUsage.mockImplementation(async () => ({
      workspace_id: "workspace-1",
      usage: [
        { type: "rolling", label: "Rolling", percentage: 25, resets_in: "30m" },
      ],
    }));
    mocks.saveOpenCodeGoConfigs.mockImplementation(async () => ({}));
    mocks.saveClineConfigs.mockImplementation(async () => ({}));
    mocks.saveOllamaCloudConfigs.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoConfig.mockImplementation(async () => ({}));
    mocks.patchClineConfig.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudConfig.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoExcludedModels.mockImplementation(async () => ({}));
    mocks.patchClineExcludedModels.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudExcludedModels.mockImplementation(async () => ({}));
    mocks.getModelDefinitions.mockImplementation(async () => [
      { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
      { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
      { id: "kimi-k2.6", object: "model", owned_by: "opencode" },
    ]);
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
          { id: "qwen3.7-max", object: "model", owned_by: "opencode" },
        ],
      },
    }));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("shows usage loading instead of not queried before the first OpenCode Go usage result", async () => {
    localStorage.clear();
    let resolveUsage:
      ((value: MockOpenCodeGoUsageResponse) => void) | undefined;
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "OpenCode Go",
        apiKey: "sk-opencode-go",
        workspaceId: "workspace-1",
        authCookie: "session=abc",
      },
    ]);
    mocks.getEntityStats.mockImplementation(async () => ({
      source: [{ entity_name: "sk-opencode-go", requests: 10, failed: 1 }],
    }));
    mocks.queryOpenCodeGoUsage.mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolveUsage = resolve;
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

    await userEvent.click(
      await screen.findByRole("tab", { name: /OpenCode Go/ }),
    );
    await waitFor(() =>
      expect(screen.getAllByText("OpenCode Go").length).toBeGreaterThan(1),
    );
    expect(screen.getByText(/Success 9/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Not queried/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Left --/i).length).toBeGreaterThan(0);

    resolveUsage?.({
      workspace_id: "workspace-1",
      usage: [
        { type: "rolling", label: "Rolling", percentage: 25, resets_in: "30m" },
      ],
    });
    expect(await screen.findByText(/Left 75%/i)).toBeInTheDocument();
  });

  test("shows effective OpenCode Go models instead of dirty legacy models", async () => {
    const user = userEvent.setup();
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "OpenCode Go Dirty",
        apiKey: "sk-opencode-go-dirty",
        models: [{ name: "cline-pass/glm-5.2" }],
        excludedModels: ["qwen3.5-plus"],
      },
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

    await user.click(await screen.findByRole("tab", { name: /OpenCode Go/ }));
    expect(await screen.findByText("OpenCode Go Dirty")).toBeInTheDocument();
    await waitFor(() => expect(mocks.apiCallRequest).toHaveBeenCalled());

    expect(await screen.findByText("deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.queryByText("cline-pass/glm-5.2")).not.toBeInTheDocument();
    expect(screen.getByText("qwen3.5-plus")).toBeInTheDocument();
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

    expect(
      await screen.findByRole("tab", { name: /OpenCode Go/ }),
    ).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", {
      name: /Add OpenCode Go configuration/i,
    });

    expect(within(dialog).queryByText("Base URL")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Models (optional)"),
    ).not.toBeInTheDocument();

    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "OpenCode Go",
    );
    await user.type(
      within(dialog).getByPlaceholderText(/Paste API Key/i),
      "sk-opencode-go",
    );
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenCode Go",
          apiKey: "sk-opencode-go",
        }),
      ]);
    });
    expect(mocks.saveOpenCodeGoConfigs.mock.calls[0][0][0]).not.toHaveProperty(
      "baseUrl",
    );
  });

  test("keeps failed OpenCode Go saves out of the rendered provider list", async () => {
    const user = userEvent.setup();
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "Existing OpenCode Go",
        apiKey: "sk-existing-opencode-go",
      },
    ]);
    mocks.saveOpenCodeGoConfigs.mockRejectedValue(
      new Error("channel name already used"),
    );

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
    const dialog = await screen.findByRole("dialog", {
      name: /Add OpenCode Go configuration/i,
    });

    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "New OpenCode Go",
    );
    await user.type(
      within(dialog).getByPlaceholderText(/Paste API Key/i),
      "sk-new-opencode-go",
    );
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

  test("saves OpenCode Go fetched model permissions and drops dirty legacy models", async () => {
    const user = userEvent.setup();
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "Existing OpenCode Go",
        apiKey: "sk-existing-opencode-go",
        models: [{ name: "cline-pass/glm-5.2" }],
        excludedModels: ["*"],
        visionFallbackModel: "qwen3.5-plus",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers/opencode-go/0"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Edit OpenCode Go configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.apiCallRequest).toHaveBeenCalled());
    expect(mocks.getModelDefinitions).not.toHaveBeenCalled();
    await user.clear(within(dialog).getByPlaceholderText(/Paste API Key/i));
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.patchOpenCodeGoConfig).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          name: "Existing OpenCode Go",
          apiKey: "",
        }),
      );
    });
    expect(mocks.saveOpenCodeGoConfigs).not.toHaveBeenCalled();
    const saved = mocks.patchOpenCodeGoConfig.mock.calls[0][1];
    expect(saved).toHaveProperty("models", []);
    expect(saved).toHaveProperty("visionFallbackModel", "qwen3.5-plus");
    expect(saved).toHaveProperty("excludedModels", ["*"]);
    expect(saved).toHaveProperty("disabled", false);
  });

  test("selects one OpenCode Go model from wildcard without restoring stale allowlist", async () => {
    const user = userEvent.setup();
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => [
      {
        name: "Existing OpenCode Go",
        apiKey: "sk-existing-opencode-go",
        models: [
          { name: "deepseek-v4-flash" },
          { name: "qwen3.5-plus" },
          { name: "kimi-k2.6" },
        ],
        excludedModels: ["*"],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers/opencode-go/0"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Edit OpenCode Go configuration/i,
    });
    await user.click(within(dialog).getByRole("tab", { name: /Models/i }));
    await waitFor(() => expect(mocks.apiCallRequest).toHaveBeenCalled());
    await user.click(
      within(dialog).getByRole("checkbox", { name: "qwen3.5-plus" }),
    );
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(mocks.patchOpenCodeGoConfig).toHaveBeenCalled());
    const saved = mocks.patchOpenCodeGoConfig.mock.calls[0][1];
    expect(saved).toHaveProperty("models", [{ name: "qwen3.5-plus" }]);
    expect(saved).toHaveProperty("excludedModels", []);
    expect(saved).toHaveProperty("disabled", false);
  });

  test("shows OpenCode Go dynamic model list without manual model inputs", async () => {
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

    const dialog = await screen.findByRole("dialog", {
      name: /Add OpenCode Go configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Basic/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: /Request/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("tab", { name: /Models/i }));
    expect(
      within(dialog).queryByText("Models (optional)"),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.apiCallRequest).toHaveBeenCalled());
    expect(mocks.getModelDefinitions).not.toHaveBeenCalled();
    const modelsTable = within(dialog).getByRole("table", {
      name: /OpenCode Go model access/i,
    });
    expect(modelsTable.closest(".table-scrollbar")).toBeInTheDocument();
    expect(modelsTable.closest("[data-vt-scroll-content]")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: /Enabled/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Select all/i }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Select none/i }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /Request/i }));
    const fallbackSelect = within(dialog).getByRole("combobox", {
      name: /Vision fallback model/i,
    });
    await user.click(fallbackSelect);
    await user.click(
      await screen.findByRole("option", { name: /qwen3\.5-plus/ }),
    );

    await user.click(within(dialog).getByRole("tab", { name: /Basic/i }));
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "OpenCode Go",
    );
    await user.type(
      within(dialog).getByPlaceholderText(/Paste API Key/i),
      "sk-opencode-go",
    );
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveOpenCodeGoConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "OpenCode Go",
          apiKey: "sk-opencode-go",
        }),
      ]);
    });
    const saved = mocks.saveOpenCodeGoConfigs.mock.calls[0][0][0];
    expect(saved).toHaveProperty("models", [
      { name: "deepseek-v4-flash" },
      { name: "qwen3.5-plus" },
      { name: "kimi-k2.6" },
      { name: "qwen3.7-max" },
    ]);
    expect(saved).toHaveProperty("visionFallbackModel", "qwen3.5-plus");
  });
});

describe("ProvidersPage Cline tab", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => []);
    mocks.getClineConfigs.mockImplementation(async () => []);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.saveOpenCodeGoConfigs.mockImplementation(async () => ({}));
    mocks.saveClineConfigs.mockImplementation(async () => ({}));
    mocks.saveOllamaCloudConfigs.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoConfig.mockImplementation(async () => ({}));
    mocks.patchClineConfig.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudConfig.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoExcludedModels.mockImplementation(async () => ({}));
    mocks.patchClineExcludedModels.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudExcludedModels.mockImplementation(async () => ({}));
    mocks.getModelDefinitions.mockImplementation(async (channel?: string) =>
      channel === "cline"
        ? [
            { id: "cline-pass/glm-5.2", object: "model", owned_by: "cline" },
            { id: "cline-pass/minimax-m3", object: "model", owned_by: "cline" },
            {
              id: "cline-pass/qwen3.7-max",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/mimo-v2.5-pro",
              object: "model",
              owned_by: "cline",
            },
          ]
        : [
            { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
            { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
          ],
    );
    mocks.apiCallRequest.mockImplementation(async () => ({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: { object: "list", data: [] },
    }));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("opens Cline route and saves default Base URL", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/ai-providers/cline/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("tab", { name: /ClinePass/ }),
    ).toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", {
      name: /Add ClinePass configuration/i,
    });

    await user.click(within(dialog).getByRole("tab", { name: /Request/i }));
    expect(
      within(dialog).getByDisplayValue("https://api.cline.bot/api/v1"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("https://api.cline.bot/api/v1/chat/completions"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: /Basic/i }));
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Gemini Primary"),
      "Cline",
    );
    await user.type(
      within(dialog).getByPlaceholderText(/Paste API Key/i),
      "sk-cline",
    );
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.saveClineConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          name: "Cline",
          apiKey: "sk-cline",
          baseUrl: "https://api.cline.bot/api/v1",
        }),
      ]);
    });
  });

  test("shows ClinePass dynamic model list without manual model inputs", async () => {
    mocks.getModelDefinitions.mockImplementation(async (channel?: string) =>
      channel === "cline"
        ? [
            { id: "cline-pass/glm-5.2", object: "model", owned_by: "cline" },
            { id: "cline-pass/minimax-m3", object: "model", owned_by: "cline" },
            {
              id: "cline-pass/qwen3.7-max",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/mimo-v2.5-pro",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/qwen3-coder",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/deepseek-v4",
              object: "model",
              owned_by: "cline",
            },
            { id: "cline-pass/kimi-k2.6", object: "model", owned_by: "cline" },
            {
              id: "cline-pass/claude-sonnet-4.5",
              object: "model",
              owned_by: "cline",
            },
            { id: "cline-pass/gpt-5.2", object: "model", owned_by: "cline" },
            {
              id: "cline-pass/gemini-3-pro",
              object: "model",
              owned_by: "cline",
            },
          ]
        : [],
    );

    render(
      <MemoryRouter initialEntries={["/ai-providers/cline/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Add ClinePass configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("cline"),
    );
    await userEvent
      .setup()
      .click(within(dialog).getByRole("tab", { name: /Models/i }));
    expect(
      within(dialog).queryByText("Models (optional)"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("cline-pass/mimo-v2.5-pro"),
    ).toBeInTheDocument();
  });

  test("shows all hidden ClinePass card models in the +X tooltip", async () => {
    const user = userEvent.setup();
    mocks.getClineConfigs.mockImplementation(async () => [
      {
        name: "Cline Tooltip",
        apiKey: "sk-cline-tooltip",
      },
    ]);
    mocks.getModelDefinitions.mockImplementation(async (channel?: string) =>
      channel === "cline"
        ? [
            { id: "cline-pass/glm-5.2", object: "model", owned_by: "cline" },
            { id: "cline-pass/minimax-m3", object: "model", owned_by: "cline" },
            {
              id: "cline-pass/qwen3.7-max",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/mimo-v2.5-pro",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/qwen3-coder",
              object: "model",
              owned_by: "cline",
            },
            {
              id: "cline-pass/deepseek-v4",
              object: "model",
              owned_by: "cline",
            },
            { id: "cline-pass/kimi-k2.6", object: "model", owned_by: "cline" },
            { id: "cline-pass/gpt-5.2", object: "model", owned_by: "cline" },
          ]
        : [],
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

    await user.click(await screen.findByRole("tab", { name: /ClinePass/ }));
    expect(await screen.findByText("Cline Tooltip")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("cline"),
    );

    await user.hover(screen.getByText("+2"));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("cline-pass/kimi-k2.6");
    expect(tooltip).toHaveTextContent("cline-pass/gpt-5.2");
  });

  test("does not show legacy ClinePass excluded models on provider cards", async () => {
    const user = userEvent.setup();
    mocks.getClineConfigs.mockImplementation(async () => [
      {
        name: "Cline Hidden Excluded",
        apiKey: "sk-cline-hidden",
        excludedModels: ["cline-pass/legacy-disabled-only"],
      },
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

    await user.click(await screen.findByRole("tab", { name: /ClinePass/ }));
    expect(
      await screen.findByText("Cline Hidden Excluded"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("cline-pass/legacy-disabled-only"),
    ).not.toBeInTheDocument();
  });

  test("saves ClinePass fetched model permissions when saving", async () => {
    const user = userEvent.setup();
    mocks.getClineConfigs.mockImplementation(async () => [
      {
        name: "Existing Cline",
        apiKey: "sk-cline",
        baseUrl: "https://api.cline.bot/api/v1",
        models: [{ name: "cline-pass/glm-5.2" }],
        excludedModels: ["*"],
        visionFallbackModel: "cline-pass/mimo-v2.5-pro",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers/cline/0"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Edit ClinePass configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("cline"),
    );
    await user.clear(within(dialog).getByPlaceholderText(/Paste API Key/i));
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.patchClineConfig).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          name: "Existing Cline",
          apiKey: "",
          excludedModels: ["*"],
        }),
      );
    });
    expect(mocks.saveClineConfigs).not.toHaveBeenCalled();
    const saved = mocks.patchClineConfig.mock.calls[0][1];
    expect(saved).toHaveProperty("models", []);
    expect(saved).toHaveProperty(
      "visionFallbackModel",
      "cline-pass/mimo-v2.5-pro",
    );
    expect(saved).toHaveProperty("disabled", false);
  });
});

describe("ProvidersPage Ollama Cloud tab", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => []);
    mocks.getClineConfigs.mockImplementation(async () => []);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.saveOllamaCloudConfigs.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoConfig.mockImplementation(async () => ({}));
    mocks.patchClineConfig.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudConfig.mockImplementation(async () => ({}));
    mocks.patchOpenCodeGoExcludedModels.mockImplementation(async () => ({}));
    mocks.patchClineExcludedModels.mockImplementation(async () => ({}));
    mocks.patchOllamaCloudExcludedModels.mockImplementation(async () => ({}));
    mocks.getModelDefinitions.mockImplementation(async () => [
      { id: "gpt-oss:120b", object: "model", owned_by: "ollama" },
    ]);
    mocks.apiCallRequest.mockImplementation(async () => ({
      statusCode: 200,
      header: {},
      bodyText: "",
      body: { object: "list", data: [] },
    }));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
  });

  test("shows Ollama Cloud dynamic model list without manual model inputs", async () => {
    render(
      <MemoryRouter initialEntries={["/ai-providers/ollama-cloud/new"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Add Ollama Cloud configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("ollama-cloud"),
    );
    await userEvent
      .setup()
      .click(within(dialog).getByRole("tab", { name: /Models/i }));
    expect(
      within(dialog).queryByText("Models (optional)"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("gpt-oss:120b")).toBeInTheDocument();
    expect(mocks.apiCallRequest).not.toHaveBeenCalled();
  });

  test("saves Ollama Cloud fetched model permissions when saving", async () => {
    const user = userEvent.setup();
    mocks.getModelDefinitions.mockImplementation(async () => [
      { id: "gpt-oss:120b", object: "model", owned_by: "ollama" },
      { id: "gpt-oss:20b", object: "model", owned_by: "ollama" },
    ]);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => [
      {
        name: "Existing Ollama Cloud",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }, { name: "gpt-oss:20b" }],
        excludedModels: ["*"],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers/ollama-cloud/0"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Edit Ollama Cloud configuration/i,
    });
    expect(
      within(dialog).getByRole("tab", { name: /Models/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("ollama-cloud"),
    );
    await user.clear(within(dialog).getByPlaceholderText(/Paste API Key/i));
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => {
      expect(mocks.patchOllamaCloudConfig).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          name: "Existing Ollama Cloud",
          apiKey: "",
          excludedModels: ["*"],
        }),
      );
    });
    expect(mocks.saveOllamaCloudConfigs).not.toHaveBeenCalled();
    const saved = mocks.patchOllamaCloudConfig.mock.calls[0][1];
    expect(saved).toHaveProperty("models", []);
    expect(saved).toHaveProperty("disabled", false);
  });

  test("uses the Ollama Cloud header checkbox to save no model access", async () => {
    const user = userEvent.setup();
    mocks.getModelDefinitions.mockImplementation(async () => [
      { id: "gpt-oss:120b", object: "model", owned_by: "ollama" },
      { id: "gpt-oss:20b", object: "model", owned_by: "ollama" },
    ]);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => [
      {
        name: "Existing Ollama Cloud",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }, { name: "gpt-oss:20b" }],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/ai-providers/ollama-cloud/0"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Edit Ollama Cloud configuration/i,
    });
    await user.click(within(dialog).getByRole("tab", { name: /Models/i }));
    await waitFor(() =>
      expect(mocks.getModelDefinitions).toHaveBeenCalledWith("ollama-cloud"),
    );
    await user.click(within(dialog).getByRole("checkbox", { name: /Enabled/i }));
    await user.click(within(dialog).getByRole("button", { name: /Save/ }));

    await waitFor(() => expect(mocks.patchOllamaCloudConfig).toHaveBeenCalled());
    const saved = mocks.patchOllamaCloudConfig.mock.calls[0][1];
    expect(saved).toHaveProperty("models", []);
    expect(saved).toHaveProperty("excludedModels", ["*"]);
    expect(saved).toHaveProperty("disabled", false);
  });

  test("does not show legacy Ollama Cloud excluded models on provider cards", async () => {
    const user = userEvent.setup();
    mocks.getOllamaCloudConfigs.mockImplementation(async () => [
      {
        name: "Ollama Hidden Excluded",
        apiKey: "sk-ollama-hidden",
        excludedModels: ["gpt-oss:legacy-disabled-only"],
      },
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

    await user.click(await screen.findByRole("tab", { name: /Ollama Cloud/ }));
    expect(
      await screen.findByText("Ollama Hidden Excluded"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("gpt-oss:legacy-disabled-only"),
    ).not.toBeInTheDocument();
  });
});

describe("mergeOpenCodeGoUsage", () => {
  test("returns incoming when existing is empty", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const incoming = [
      { type: "rolling", label: "Rolling", percentage: 50, resets_in: "30m" },
    ];
    expect(mergeOpenCodeGoUsage([], incoming)).toEqual(incoming);
  });

  test("returns existing when incoming is empty", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [
      { type: "weekly", label: "Weekly", percentage: 30, resets_in: "3d" },
    ];
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
    const incoming = [
      { type: "rolling", label: "Rolling", percentage: 80, resets_in: "25m" },
    ];
    const result = mergeOpenCodeGoUsage(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result.find((i) => i.type === "rolling")?.percentage).toBe(80);
    expect(result.find((i) => i.type === "weekly")?.percentage).toBe(30);
    expect(result.find((i) => i.type === "monthly")?.percentage).toBe(10);
  });

  test("handles case-insensitive type matching", async () => {
    const { mergeOpenCodeGoUsage } =
      await import("@pages/providers/components/OpenCodeGoUsageCardSection");
    const existing = [
      { type: "Rolling", label: "Rolling", percentage: 50, resets_in: "30m" },
    ];
    const incoming = [
      { type: "rolling", label: "Rolling", percentage: 75, resets_in: "25m" },
    ];
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
    const incoming = [
      { type: "rolling", label: "Rolling", percentage: 80, resets_in: "25m" },
    ];
    const result = mergeOpenCodeGoUsage(existing, incoming);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("rolling");
    expect(result[1].type).toBe("monthly");
    expect(result[2].type).toBe("weekly");
  });
});
