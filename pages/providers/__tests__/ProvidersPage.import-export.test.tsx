import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<any[]> => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getClineConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getBedrockConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  saveCodexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
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

describe("ProvidersPage import/export", () => {
  const createObjectURL = vi.fn(() => "blob:mock");
  const revokeObjectURL = vi.fn();
  const clickSpy = vi.fn();

  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getGeminiKeys.mockImplementation(async () => []);
    mocks.getClaudeConfigs.mockImplementation(async () => []);
    mocks.getCodexConfigs.mockImplementation(
      async () =>
        [
          {
            name: "Legacy",
            apiKey: "sk-legacy",
          },
          {
            name: "Codex Main",
            apiKey: "sk-old",
            headers: { Existing: "1" },
            excludedModels: ["gpt-4"],
          },
        ] as any,
    );
    mocks.getOpenCodeGoConfigs.mockImplementation(async () => []);
    mocks.getClineConfigs.mockImplementation(async () => []);
    mocks.getOllamaCloudConfigs.mockImplementation(async () => []);
    mocks.getVertexConfigs.mockImplementation(async () => []);
    mocks.getBedrockConfigs.mockImplementation(async () => []);
    mocks.getOpenAIProviders.mockImplementation(async () => []);
    mocks.saveCodexConfigs.mockImplementation(async () => ({}));
    mocks.getEntityStats.mockImplementation(async () => ({ source: [] }));
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);

    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy);
  });

  test("exports the active provider tab as normalized JSON", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Export JSON$/i }));
    await user.click(await screen.findByRole("menuitem", { name: /^Export JSON$/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"provider": "codex"');
    await expect(blob.text()).resolves.toContain('"items"');
    expect(clickSpy).toHaveBeenCalled();
  });

  test("keeps import enabled while switching and refreshing provider tabs", async () => {
    const user = userEvent.setup();
    let resolveRefresh: ((configs: any[]) => void) | undefined;
    mocks.getCodexConfigs
      .mockResolvedValueOnce([
        {
          name: "Codex Main",
          apiKey: "sk-old",
        },
      ] as any)
      .mockImplementationOnce(() => new Promise<any[]>((resolve) => (resolveRefresh = resolve)));

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const importButton = await screen.findByRole("button", { name: /Import JSON/i });
    expect(importButton).toBeEnabled();

    await user.click(screen.getByRole("tab", { name: /Codex/ }));
    expect(importButton).toBeEnabled();
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    const refreshButton = screen.getByRole("button", { name: /Refresh/i });
    await user.click(refreshButton);
    expect(importButton).toBeEnabled();
    await waitFor(() => expect(refreshButton).toBeDisabled());
    expect(refreshButton.querySelector("svg")).toHaveClass("animate-spin");
    expect(screen.getByText("Codex Main")).toBeInTheDocument();
    expect(screen.queryByTestId("providers-list-skeleton")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();

    resolveRefresh?.([]);
    await waitFor(() => expect(mocks.getCodexConfigs).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });

  test("shows skeleton cards when switching to an unloaded provider tab", async () => {
    const user = userEvent.setup();
    let resolveSwitch: ((configs: any[]) => void) | undefined;
    mocks.getCodexConfigs.mockImplementationOnce(
      () => new Promise<any[]>((resolve) => (resolveSwitch = resolve)),
    );

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const refreshButton = await screen.findByRole("button", { name: /Refresh/i });
    await user.click(screen.getByRole("tab", { name: /Codex/ }));

    await waitFor(() => expect(refreshButton).toBeDisabled());
    expect(refreshButton.querySelector("svg")).toHaveClass("animate-spin");
    expect(screen.getByTestId("providers-list-skeleton")).toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();

    resolveSwitch?.([
      {
        name: "Codex Main",
        apiKey: "sk-old",
      },
    ]);
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("providers-list-skeleton")).not.toBeInTheDocument(),
    );
  });

  test("does not refresh when clicking the active provider tab again", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const codexTab = await screen.findByRole("tab", { name: /Codex/ });
    await user.click(codexTab);
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getCodexConfigs).toHaveBeenCalledTimes(1));

    await user.click(codexTab);
    expect(mocks.getCodexConfigs).toHaveBeenCalledTimes(1);
  });

  test("keeps provider import, refresh, and export actions together in the batch toolbar", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    const batchActions = screen.getByTestId("providers-batch-actions");
    expect(within(batchActions).getByRole("button", { name: /Import JSON/i })).toBeInTheDocument();
    expect(within(batchActions).getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    expect(
      within(batchActions).getByRole("button", { name: /^Export JSON$/i }),
    ).toBeInTheDocument();
  });

  test("keeps provider scrolling inside the card list area", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    expect(screen.getByTestId("providers-page-shell")).toHaveClass(
      "h-[calc(100dvh-97px)]",
      "sm:h-[calc(100dvh-113px)]",
      "overflow-hidden",
    );
    expect(screen.getByTestId("providers-tab-scroll")).toHaveClass("overflow-y-auto");
  });

  test("exports only the selected provider cards as JSON", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Select Codex Main/i }));
    await user.click(screen.getByRole("button", { name: /^Export JSON$/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Export Selected JSON/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"name": "Codex Main"');
    await expect(blob.text()).resolves.not.toContain('"name": "Legacy"');
  });

  test("selects all provider cards in the active tab for export", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Select All/i }));
    await user.click(screen.getByRole("button", { name: /^Export JSON$/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Export Selected JSON/i }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"name": "Legacy"');
    await expect(blob.text()).resolves.toContain('"name": "Codex Main"');
  });

  test("shows diff preview before import and saves the normalized configs after confirmation", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    const file = new File(
      [
        JSON.stringify({
          provider: "codex",
          items: [
            {
              name: "Codex Main",
              "api-key": "sk-old",
              headers: { Z: "2", A: "1" },
              "excluded-models": ["gpt-4", "gpt-4", "claude-3"],
            },
            {
              name: "Codex Main",
              "api-key": "sk-old",
              headers: { A: "1", Z: "2" },
              "excluded-models": ["claude-3", "gpt-4"],
            },
            {
              name: "Codex Fresh",
              "api-key": "sk-new",
            },
          ],
        }),
      ],
      "codex.json",
      { type: "application/json" },
    );

    const input = screen.getByLabelText(/Import JSON/i);
    await user.upload(input, file);

    const dialog = await screen.findByRole("dialog", { name: /Import preview/i });
    expect(within(dialog).getByText(/Added: 1/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Updated: 1/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Removed: 1/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Duplicates cleaned: 1/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /Confirm import/i }));

    await waitFor(() => {
      expect(mocks.saveCodexConfigs).toHaveBeenCalledWith([
        {
          name: "Codex Fresh",
          apiKey: "sk-new",
        },
        {
          name: "Codex Main",
          apiKey: "sk-old",
          headers: { A: "1", Z: "2" },
          excludedModels: ["claude-3", "gpt-4"],
        },
      ]);
    });
  });

  test("blocks no-op imports after normalization so repeated imports do not dirty the data", async () => {
    const user = userEvent.setup();

    mocks.getCodexConfigs.mockImplementation(
      async () =>
        [
          {
            name: "Codex Main",
            apiKey: "sk-old",
            headers: { A: "1", Z: "2" },
            excludedModels: ["claude-3", "gpt-4"],
          },
        ] as any,
    );

    render(
      <MemoryRouter initialEntries={["/access/ai-providers"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("tab", { name: /Codex/ }));
    expect(await screen.findByText("Codex Main")).toBeInTheDocument();

    const file = new File(
      [
        JSON.stringify({
          provider: "codex",
          items: [
            {
              name: "Codex Main",
              "api-key": "sk-old",
              headers: { Z: "2", A: "1" },
              "excluded-models": ["gpt-4", "claude-3", "gpt-4"],
            },
          ],
        }),
      ],
      "codex.json",
      { type: "application/json" },
    );

    await user.upload(screen.getByLabelText(/Import JSON/i), file);

    const dialog = await screen.findByRole("dialog", { name: /Import preview/i });
    expect(within(dialog).getByText(/No changes detected/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Confirm import/i })).toBeDisabled();
    expect(mocks.saveCodexConfigs).not.toHaveBeenCalled();
  });
});
