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
  getOpenCodeGoConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getBedrockConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  saveCodexConfigs: vi.fn(async (_configs: unknown[]) => ({})),
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
      getOpenCodeGoConfigs: mocks.getOpenCodeGoConfigs,
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

    await user.click(screen.getByRole("button", { name: /Export JSON/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"provider": "codex"');
    await expect(blob.text()).resolves.toContain('"items"');
    expect(clickSpy).toHaveBeenCalled();
  });

  test("exports only the selected provider cards as JSON", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("checkbox", { name: /Select Codex Main/i }));
    await user.click(screen.getByRole("button", { name: /Export Selected JSON/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"name": "Codex Main"');
    await expect(blob.text()).resolves.not.toContain('"name": "Legacy"');
  });

  test("selects all provider cards in the active tab for export", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: /Select All/i }));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Export Selected JSON/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain('"name": "Legacy"');
    await expect(blob.text()).resolves.toContain('"name": "Codex Main"');
  });

  test("shows diff preview before import and saves the normalized configs after confirmation", async () => {
    const user = userEvent.setup();

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
