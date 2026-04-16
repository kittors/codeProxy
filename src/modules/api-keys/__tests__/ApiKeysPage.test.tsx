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
  apiClientGet: vi.fn(async () => ({ data: [{ id: "gpt-4.1" }] })),
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

    await userEvent.click(screen.getAllByTitle("Edit")[1]!);
    const nameInput = screen.getAllByPlaceholderText(/team-a/i).at(-1)!;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Key");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });

    await userEvent.click(screen.getAllByTitle("Delete")[1]!);
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesDelete).toHaveBeenCalled();
    });
    expect(screen.queryByText("Renamed Key")).not.toBeInTheDocument();
  });
});
