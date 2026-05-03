import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ApiKeysPage } from "@/modules/api-keys/ApiKeysPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const state = vi.hoisted(() => ({
  entries: [] as any[],
  channelGroups: [] as any[],
}));

const mocks = vi.hoisted(() => ({
  apiKeyEntriesList: vi.fn(async () => state.entries),
  apiKeyEntriesReplace: vi.fn(async (entries: any[]) => {
    state.entries = entries;
    return {};
  }),
  apiKeyEntriesUpdate: vi.fn(async ({ index, value }: any) => {
    state.entries[index] = { ...state.entries[index], ...value };
    return {};
  }),
  apiKeyEntriesDelete: vi.fn(async ({ index }: any) => {
    state.entries.splice(index, 1);
    return { logs_deleted: 0 };
  }),
  apiKeysList: vi.fn(async () => [] as string[]),
  authFilesList: vi.fn(async () => ({ files: [] })),
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  apiClientGet: vi.fn(async (url: string) => {
    if (url === "/channel-groups") {
      return { items: state.channelGroups };
    }
    if (url.includes("allowed_channel_groups=pro")) {
      return { data: [{ id: "gpt-5.3-codex" }, { id: "gpt-5.4" }] };
    }
    if (url.includes("allowed_channel_groups=team-a")) {
      return { data: [{ id: "claude-sonnet-4-5" }] };
    }
    return { data: [{ id: "gpt-4.1" }] };
  }),
  handleViewUsage: vi.fn(),
  fetchUsageLogs: vi.fn(),
}));

vi.mock("@/lib/http/apis/api-keys", () => ({
  apiKeysApi: {
    list: mocks.apiKeysList,
  },
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
    replace: mocks.apiKeyEntriesReplace,
    update: mocks.apiKeyEntriesUpdate,
    delete: mocks.apiKeyEntriesDelete,
  },
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.authFilesList,
    },
    providersApi: {
      ...mod.providersApi,
      getGeminiKeys: mocks.getGeminiKeys,
      getClaudeConfigs: mocks.getClaudeConfigs,
      getCodexConfigs: mocks.getCodexConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
    },
  };
});

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiClientGet,
  },
}));

vi.mock("@/modules/api-keys/hooks/useApiKeyUsageView", () => ({
  useApiKeyUsageView: () => ({
    usageViewKey: null,
    usageViewName: "",
    usageLoading: false,
    usageTotalCount: 0,
    usageCurrentPage: 1,
    usagePageSize: 20,
    setUsagePageSize: vi.fn(),
    usageLastUpdatedText: "--",
    usageTimeRange: 7,
    setUsageTimeRange: vi.fn(),
    usageChannelQuery: "",
    setUsageChannelQuery: vi.fn(),
    usageChannelGroupQuery: "",
    setUsageChannelGroupQuery: vi.fn(),
    usageModelQuery: "",
    setUsageModelQuery: vi.fn(),
    usageStatusFilter: "all",
    setUsageStatusFilter: vi.fn(),
    usageContentModalOpen: false,
    setUsageContentModalOpen: vi.fn(),
    usageContentModalLogId: null,
    usageContentModalTab: "request",
    usageErrorModalOpen: false,
    setUsageErrorModalOpen: vi.fn(),
    usageErrorModalLogId: null,
    usageErrorModalModel: "",
    usageLogColumns: [],
    usageRows: [],
    usageTotalPages: 1,
    usageChannelOptions: [],
    usageChannelGroupOptions: [],
    usageModelOptions: [],
    fetchUsageLogs: mocks.fetchUsageLogs,
    handleViewUsage: mocks.handleViewUsage,
    closeUsageModal: vi.fn(),
  }),
}));

vi.mock("@/modules/monitor/LogContentModal", () => ({
  LogContentModal: () => null,
}));

vi.mock("@/modules/monitor/ErrorDetailModal", () => ({
  ErrorDetailModal: () => null,
}));

vi.mock("@/modules/ui/VirtualTable", () => ({
  VirtualTable: ({ rows, columns }: { rows: any[]; columns: any[] }) => (
    <div>
      {rows.map((row, rowIndex) => (
        <div key={row.key}>
          {columns.map((column: any) => (
            <div key={column.key}>
              {column.render ? column.render(row, rowIndex) : row[column.key]}
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe("ApiKeysPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    state.entries = [
      {
        key: "sk-existing-1234567890",
        name: "Existing Key",
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [];
    mocks.apiKeyEntriesList.mockClear();
    mocks.apiKeyEntriesReplace.mockClear();
    mocks.apiKeyEntriesUpdate.mockClear();
    mocks.apiKeyEntriesDelete.mockClear();
    mocks.apiKeysList.mockClear();
    mocks.authFilesList.mockClear();
    mocks.getGeminiKeys.mockClear();
    mocks.getClaudeConfigs.mockClear();
    mocks.getCodexConfigs.mockClear();
    mocks.getVertexConfigs.mockClear();
    mocks.getOpenAIProviders.mockClear();
    mocks.apiClientGet.mockClear();
  });

  test("creates, edits, and deletes API key entries", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create key/i }));
    await userEvent.type(screen.getAllByPlaceholderText(/team-a/i).at(-1)!, "New Key");
    await userEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalled();
    });
    expect(await screen.findByText("New Key")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    const nameInput = screen.getAllByPlaceholderText(/team-a/i).at(-1)!;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Key");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });

    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]!);
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesDelete).toHaveBeenCalled();
    });
    expect(screen.queryByText("Renamed Key")).not.toBeInTheDocument();
  });

  test("clears exact channel restrictions when the advanced override is turned off", async () => {
    state.entries = [
      {
        key: "sk-existing-1234567890",
        name: "Pinned Key",
        "allowed-channels": ["Kimi渠道"],
        "allowed-channel-groups": ["kimi-pool"],
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Pinned Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("switch", { name: /exact channel override/i }));
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });

    expect(mocks.apiKeyEntriesUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({
          "allowed-channels": [],
          "allowed-channel-groups": ["kimi-pool"],
        }),
      }),
    );
  });

  test("shows operation column icon tooltips without relying on the app-level tooltip listener", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();

    await userEvent.hover(screen.getByRole("button", { name: /copy key/i }));

    expect(screen.getByRole("tooltip")).toHaveTextContent(/copy key/i);
  });

  test("opens CC Switch import modal and launches selected client deeplink", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import to cc switch/i }));

    const dialog = await screen.findByRole("dialog", { name: /import to cc switch/i });
    expect(dialog).toHaveTextContent(/claude code/i);

    await userEvent.click(screen.getByRole("combobox", { name: /client type/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Codex" }));

    await userEvent.click(screen.getByRole("button", { name: /import codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-existing-1234567890");

    openSpy.mockRestore();
  });

  test("imports a Codex CC Switch provider from the selected client-specific form", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    state.entries = [
      {
        key: "sk-group-1234567890",
        name: "Group Key",
        "allowed-channel-groups": ["pro", "team-a"],
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
      },
      {
        name: "team-a",
        description: "Team A route",
        "path-routes": ["/team-a"],
      },
    ];

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Group Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    const clientTypeSelect = screen.getByRole("combobox", { name: /client type/i });
    await userEvent.click(clientTypeSelect);
    await userEvent.click(await screen.findByRole("option", { name: "Codex" }));

    expect(screen.queryByRole("combobox", { name: /claude code auth field/i })).toBeNull();

    const providerNameInput = screen.getByRole("textbox", { name: /provider name/i });
    await userEvent.clear(providerNameInput);
    await userEvent.type(providerNameInput, "Work");

    await userEvent.click(screen.getByRole("checkbox", { name: /enabled by default/i }));

    const modelSelect = await screen.findByRole("combobox", { name: /model/i });
    await userEvent.click(modelSelect);
    await userEvent.click(await screen.findByRole("option", { name: "gpt-5.4" }));

    await userEvent.click(screen.getByRole("button", { name: /import codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("name")).toBe("Work");
    expect(parsed.searchParams.get("endpoint")).toBe("http://localhost:3000/pro/v1");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.4");
    expect(parsed.searchParams.get("enabled")).toBe("false");
    expect(parsed.searchParams.has("apiKeyField")).toBe(false);

    openSpy.mockRestore();
  });

  test("keeps the CC Switch client-specific panel stable while switching client types", async () => {
    state.entries = [
      {
        key: "sk-group-1234567890",
        name: "Group Key",
        "allowed-channel-groups": ["pro"],
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
      },
    ];

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Group Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    const detailsPanel = screen.getByTestId("ccswitch-client-specific-panel");
    expect(detailsPanel).toHaveClass("min-h-[76px]");
    expect(screen.getByRole("combobox", { name: /claude code auth field/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: /client type/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Codex" }));

    expect(screen.getByTestId("ccswitch-client-specific-panel")).toBe(detailsPanel);
    expect(screen.queryByRole("combobox", { name: /claude code auth field/i })).toBeNull();
    expect(detailsPanel).toHaveTextContent(/openai-compatible/i);
    expect(detailsPanel).toHaveTextContent(/\/v1/i);
  });

  test("imports a Claude Code CC Switch provider with its auth field in the selected form", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    state.entries = [
      {
        key: "sk-group-1234567890",
        name: "Claude Key",
        "allowed-channel-groups": ["team-a"],
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [
      {
        name: "team-a",
        description: "Team A route",
        "path-routes": ["/team-a"],
      },
    ];

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Claude Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    const clientTypeSelect = screen.getByRole("combobox", { name: /client type/i });
    await userEvent.click(clientTypeSelect);
    await userEvent.click(await screen.findByRole("option", { name: "Claude Code" }));

    expect(screen.getByRole("combobox", { name: /claude code auth field/i })).toHaveTextContent(
      "ANTHROPIC_API_KEY",
    );

    const providerNameInput = screen.getByRole("textbox", { name: /provider name/i });
    await userEvent.clear(providerNameInput);
    await userEvent.type(providerNameInput, "Anthropic Work");

    await userEvent.click(screen.getByRole("button", { name: /import claude code/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("claude");
    expect(parsed.searchParams.get("name")).toBe("Anthropic Work");
    expect(parsed.searchParams.get("endpoint")).toBe("http://localhost:3000/team-a");
    expect(parsed.searchParams.get("model")).toBe("claude-sonnet-4-5");
    expect(parsed.searchParams.get("apiKeyField")).toBe("ANTHROPIC_API_KEY");

    openSpy.mockRestore();
  });
});
