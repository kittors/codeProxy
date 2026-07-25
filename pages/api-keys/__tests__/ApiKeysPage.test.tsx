import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiKeysPage } from "../ApiKeysPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const state = vi.hoisted(() => ({
  entries: [] as any[],
  channelGroups: [] as any[],
  ccSwitchImportConfigs: [] as any[],
  configYaml: "",
  permissionProfiles: [] as any[],
}));

const mocks = vi.hoisted(() => ({
  apiKeyEntriesList: vi.fn(async () => state.entries),
  apiKeyEntriesReplace: vi.fn(async (entries: any[]) => {
    state.entries = entries;
    return {};
  }),
  apiKeyEntriesUpdate: vi.fn(async ({ id, index, value }: any) => {
    const targetIndex =
      typeof index === "number"
        ? index
        : state.entries.findIndex((entry) => (id ? entry.id === id : false));
    if (targetIndex >= 0) {
      state.entries[targetIndex] = { ...state.entries[targetIndex], ...value };
    }
    return {};
  }),
  apiKeyEntriesDelete: vi.fn(async ({ id, index, key }: any) => {
    const deleteIndex =
      typeof index === "number"
        ? index
        : state.entries.findIndex((entry) => (id ? entry.id === id : entry.key === key));
    if (deleteIndex >= 0) {
      state.entries.splice(deleteIndex, 1);
    }
    return { logs_deleted: 0 };
  }),
  apiKeyEntriesResetDailySpending: vi.fn(async ({ id, key }: { id?: string; key?: string }) => {
    const entry = state.entries.find((item) => (id ? item.id === id : item.key === key));
    if (entry) {
      entry["daily-spending-used"] = 0;
      entry["daily-spending-remaining"] = entry["daily-spending-limit"] ?? 0;
      entry["daily-spending-reset-count"] = (entry["daily-spending-reset-count"] ?? 0) + 1;
    }
    return {
      status: "ok",
      id: entry?.id,
      key: entry?.key,
      "daily-spending-used": 0,
      "daily-spending-remaining": entry?.["daily-spending-limit"] ?? 0,
      "daily-spending-reset-count": entry?.["daily-spending-reset-count"] ?? 0,
    };
  }),
  apiKeyEntriesListDailySpendingResetHistory: vi.fn(async () => ({
    items: [],
    total: 0,
  })),
  apiKeysList: vi.fn(async (): Promise<string[]> => []),
  endUserListKeys: vi.fn(async (userId: string) => ({
    items: state.entries
      .filter((entry) => entry.end_user_id === userId)
      .map((entry) => ({
        id: entry.id,
        tenant_id: "tenant-1",
        end_user_id: userId,
        key_masked: entry.key ? `${entry.key.slice(0, 5)}•••${entry.key.slice(-3)}` : "",
        name: entry.name,
        disabled: Boolean(entry.disabled),
        is_default: Boolean(entry.is_default),
        created_at: entry["created-at"],
        "daily-spending-limit": entry["daily-spending-limit"] ?? 0,
        "period-spending-limits": entry["period-spending-limits"] ?? {
          "5h": 0,
          day: 0,
          week: 0,
          month: 0,
        },
        "period-spending": entry["period-spending"] ?? [],
        "daily-spending-used": entry["daily-spending-used"] ?? 0,
        "lifetime-spending-used": entry["lifetime-spending-used"] ?? 0,
        "daily-spending-reset-count": entry["daily-spending-reset-count"] ?? 0,
      })),
  })),
  endUserCreateKey: vi.fn(
    async (
      userId: string,
      body: { name?: string; "period-spending-limits"?: Record<string, number> },
    ) => {
      const entry = {
        id: "owned-created",
        key: "sk-owned-created-secret",
        name: body.name ?? "",
        end_user_id: userId,
        disabled: false,
        is_default: state.entries.length === 0,
        "created-at": "2026-07-21T00:00:00Z",
        "period-spending-limits": body["period-spending-limits"] ?? {
          "5h": 0,
          day: 0,
          week: 0,
          month: 0,
        },
      };
      state.entries.push(entry);
      return { api_key: entry, plaintext_key: entry.key };
    },
  ),
  endUserUpdateKey: vi.fn(
    async (
      userId: string,
      keyId: string,
      body: { name?: string; "period-spending-limits"?: Record<string, number> },
    ) => {
      const entry = state.entries.find((item) => item.id === keyId && item.end_user_id === userId);
      if (entry)
        Object.assign(entry, {
          name: body.name ?? entry.name,
          "period-spending-limits":
            body["period-spending-limits"] ?? entry["period-spending-limits"],
          "daily-spending-limit":
            body["period-spending-limits"]?.day ?? entry["daily-spending-limit"],
        });
      return entry;
    },
  ),
  endUserResetKeyDailySpending: vi.fn(async () => ({ status: "ok" })),
  endUserListKeyDailySpendingResetHistory: vi.fn(async () => ({ items: [], total: 0 })),
  endUserRotateKey: vi.fn(async (userId: string, keyId: string) => {
    const entry = state.entries.find((item) => item.id === keyId && item.end_user_id === userId);
    if (!entry) throw new Error("not found");
    entry.key = "sk-owned-rotated-secret";
    return { api_key: entry, plaintext_key: entry.key };
  }),
  endUserDeleteKey: vi.fn(async (userId: string, keyId: string) => {
    state.entries = state.entries.filter(
      (item) => !(item.id === keyId && item.end_user_id === userId),
    );
  }),
  fetchConfigYaml: vi.fn(async () => state.configYaml),
  saveConfigYaml: vi.fn(async (content: string) => {
    state.configYaml = content;
    return {};
  }),
  apiClientPut: vi.fn(async (url: string, body: any) => {
    if (url === "/api-key-permission-profiles") {
      state.permissionProfiles = body;
    }
    if (url === "/ccswitch-import-configs") {
      state.ccSwitchImportConfigs = body;
    }
    return {};
  }),
  authFilesList: vi.fn(async () => ({ files: [] })),
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  apiClientGet: vi.fn(async (url: string) => {
    if (url === "/api-key-permission-profiles") {
      return { "api-key-permission-profiles": state.permissionProfiles };
    }
    if (url === "/ccswitch-import-configs") {
      return { "ccswitch-import-configs": state.ccSwitchImportConfigs };
    }
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

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeysApi: {
    list: mocks.apiKeysList,
  },
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
    replace: mocks.apiKeyEntriesReplace,
    update: mocks.apiKeyEntriesUpdate,
    delete: mocks.apiKeyEntriesDelete,
    resetDailySpending: mocks.apiKeyEntriesResetDailySpending,
    listDailySpendingResetHistory: mocks.apiKeyEntriesListDailySpendingResetHistory,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/end-users", () => ({
  endUsersApi: {
    listKeys: mocks.endUserListKeys,
    createKey: mocks.endUserCreateKey,
    updateKey: mocks.endUserUpdateKey,
    resetKeyDailySpending: mocks.endUserResetKeyDailySpending,
    listKeyDailySpendingResetHistory: mocks.endUserListKeyDailySpendingResetHistory,
    rotateKey: mocks.endUserRotateKey,
    deleteKey: mocks.endUserDeleteKey,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/config-file", () => ({
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: {
    list: vi.fn(async () => state.channelGroups),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/api-key-permission-profiles", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@code-proxy/api-client/endpoints/api-key-permission-profiles")
    >();
  return {
    ...mod,
    apiKeyPermissionProfilesApi: {
      list: async () =>
        mod.normalizeApiKeyPermissionProfiles(
          (await mocks.apiClientGet("/api-key-permission-profiles"))[
            "api-key-permission-profiles"
          ] ?? [],
        ),
      replace: async (profiles: Array<Record<string, unknown>>) =>
        mocks.apiClientPut("/api-key-permission-profiles", profiles),
    },
  };
});

vi.mock("@code-proxy/api-client/endpoints/ccswitch-import-configs", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@code-proxy/api-client/endpoints/ccswitch-import-configs")
    >();
  return {
    ...mod,
    ccSwitchImportConfigsApi: {
      list: async () =>
        mod.normalizeCcSwitchImportConfigs(
          (await mocks.apiClientGet("/ccswitch-import-configs"))["ccswitch-import-configs"] ?? [],
        ),
      replace: async (configs: unknown[]) =>
        mocks.apiClientPut("/ccswitch-import-configs", configs),
    },
  };
});

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    apiClient: {
      get: mocks.apiClientGet,
      put: mocks.apiClientPut,
    },
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.authFilesList,
    },
    providersApi: {
      ...mod.providersApi,
      getGeminiKeys: mocks.getGeminiKeys,
      getClaudeConfigs: mocks.getClaudeConfigs,
      getCodexConfigs: mocks.getCodexConfigs,
      getOllamaCloudConfigs: mocks.getOllamaCloudConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
    },
  };
});

vi.mock("../hooks/useApiKeyUsageView", () => ({
  useApiKeyUsageView: () => ({
    usageViewKey: null,
    usageViewName: "",
    usageLoading: false,
    usageTotalCount: 0,
    usageSummary: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      requestCount: 0,
      successRate: 0,
    },
    usageCurrentPage: 1,
    usagePageSize: 20,
    setUsagePageSize: vi.fn(),
    usageLastUpdatedText: "--",
    usageTimeRange: 7,
    setUsageTimeRange: vi.fn(),
    usageKeyQuery: "",
    setUsageKeyQuery: vi.fn(),
    usageChannelQuery: "",
    setUsageChannelQuery: vi.fn(),
    usageModelQuery: "",
    setUsageModelQuery: vi.fn(),
    usageStatusFilter: "",
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
    usageKeyOptions: [],
    usageChannelOptions: [],
    usageModelOptions: [],
    usageStatusOptions: [],
    fetchUsageLogs: mocks.fetchUsageLogs,
    handleViewUsage: mocks.handleViewUsage,
    closeUsageModal: vi.fn(),
  }),
}));

vi.mock("@features/log-content-viewer", () => ({
  LogContentModal: () => null,
  ErrorDetailModal: () => null,
}));

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  DataTable: ({ rows, columns }: { rows: any[]; columns: any[] }) => (
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

async function openMoreActions(index = 0) {
  await userEvent.click(screen.getAllByRole("button", { name: "More actions" })[index]!);
}

describe("ApiKeysPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    state.entries = [
      {
        key: "sk-existing-1234567890",
        name: "Existing Key",
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [];
    state.ccSwitchImportConfigs = [];
    state.configYaml = "";
    state.permissionProfiles = [];
    mocks.apiKeyEntriesList.mockClear();
    mocks.apiKeyEntriesReplace.mockClear();
    mocks.apiKeyEntriesUpdate.mockClear();
    mocks.apiKeyEntriesDelete.mockClear();
    mocks.apiKeysList.mockClear();
    mocks.endUserCreateKey.mockClear();
    mocks.endUserUpdateKey.mockClear();
    mocks.endUserRotateKey.mockClear();
    mocks.endUserDeleteKey.mockClear();
    mocks.fetchConfigYaml.mockClear();
    mocks.saveConfigYaml.mockClear();
    mocks.apiClientPut.mockClear();
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

    await openMoreActions(1);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const nameInput = screen.getAllByPlaceholderText(/team-a/i).at(-1)!;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Key");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });

    await openMoreActions(1);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesDelete).toHaveBeenCalled();
    });
    expect(screen.queryByText("Renamed Key")).not.toBeInTheDocument();
  });

  test("allows manually entering an API key when creating an entry", async () => {
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
    await userEvent.type(screen.getAllByPlaceholderText(/team-a/i).at(-1)!, "Manual Key");

    const keyInput = screen.getByPlaceholderText(/enter api key/i);
    await userEvent.clear(keyInput);
    await userEvent.type(keyInput, "sk-team-a-manual-key");

    await userEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalled();
    });
    expect(mocks.apiKeyEntriesReplace).toHaveBeenLastCalledWith([
      expect.objectContaining({ key: "sk-existing-1234567890" }),
      expect.objectContaining({ key: "sk-team-a-manual-key", name: "Manual Key" }),
    ]);
  });

  test("allows changing an existing API key value", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    const keyInput = screen.getByDisplayValue("sk-existing-1234567890");
    await userEvent.clear(keyInput);
    await userEvent.type(keyInput, "sk-restored-same-downstream-key");

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });
    expect(mocks.apiKeyEntriesUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        index: 0,
        value: expect.objectContaining({
          key: "sk-restored-same-downstream-key",
          name: "Existing Key",
        }),
      }),
    );
  });

  test("uses owner-scoped rename and explicit rotation for an end-user key", async () => {
    state.entries = [
      {
        id: "owned-key-1",
        key: "sk-owned-original-secret",
        name: "Owned Key",
        end_user_id: "end-user-1",
        disabled: false,
        is_default: true,
        "created-at": "2026-07-21T00:00:00Z",
        "daily-spending-limit": 100,
        "period-spending-limits": { "5h": 50, day: 100, week: 300, month: 1000 },
        "period-spending": [{ period: "day", limit: 100, used: 20, remaining: 80 }],
        "daily-spending-used": 20,
        "lifetime-spending-used": 300.12,
        "daily-spending-reset-count": 2,
      },
    ];

    render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <ApiKeysPage
              endUserId="end-user-1"
              accountPeriodSpendingLimits={{ "5h": 100, day: 300, week: 800, month: 4000 }}
              embed
            />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Owned Key")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit Key quota" }));

    const editDialog = await screen.findByRole("dialog");
    expect(
      within(editDialog).queryByDisplayValue("sk-owned-original-secret"),
    ).not.toBeInTheDocument();
    expect(
      within(editDialog).queryByRole("button", { name: /refresh key/i }),
    ).not.toBeInTheDocument();
    expect(editDialog).toHaveTextContent(/Key sub-quota/i);
    expect(editDialog).toHaveTextContent(/Account limit \$300/i);

    const nameInput = within(editDialog).getByPlaceholderText(/team-a/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Renamed Owned Key");
    await userEvent.click(within(editDialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.endUserUpdateKey).toHaveBeenCalledWith(
        "end-user-1",
        "owned-key-1",
        expect.objectContaining({
          name: "Renamed Owned Key",
          "period-spending-limits": { "5h": 50, day: 100, week: 300, month: 1000 },
        }),
      );
    });
    expect(mocks.apiKeyEntriesUpdate).not.toHaveBeenCalled();
    expect(await screen.findByText("Renamed Owned Key")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /rotate key/i }));
    const rotateDialog = await screen.findByRole("dialog");
    expect(rotateDialog).toHaveTextContent(/old key becomes invalid immediately/i);
    await userEvent.click(within(rotateDialog).getByRole("button", { name: /rotate key/i }));

    await waitFor(() => {
      expect(mocks.endUserRotateKey).toHaveBeenCalledWith("end-user-1", "owned-key-1");
    });
    expect(await screen.findByText("sk-owned-rotated-secret")).toBeInTheDocument();
    expect(state.entries[0]?.key).toBe("sk-owned-rotated-secret");
  });

  test("keeps permissions out of the edit modal and preserves them while saving basics", async () => {
    state.entries = [
      {
        key: "sk-existing-1234567890",
        name: "Pinned Key",
        "allowed-channels": ["Kimi渠道"],
        "allowed-channel-groups": ["kimi-pool"],
        "allowed-models": ["kimi-k2"],
        "spending-limit": 7.5,
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

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(screen.queryByText(/Allowed channel groups/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Allowed channels/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Allowed models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Daily request limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/System prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /exact channel override/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesUpdate).toHaveBeenCalled();
    });

    expect(mocks.apiKeyEntriesUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({
          name: "Pinned Key",
          "allowed-channels": ["Kimi渠道"],
          "allowed-channel-groups": ["kimi-pool"],
          "allowed-models": ["kimi-k2"],
          "spending-limit": 7.5,
        }),
      }),
    );
  });

  test("applies the selected permission config when creating an API key", async () => {
    state.permissionProfiles = [
      {
        id: "standard",
        name: "Standard",
        "daily-limit": 15000,
        "total-quota": 0,
        "daily-spending-limit": 150,
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": [],
        "allowed-models": ["gpt-5.4"],
        "system-prompt": "Use the standard workspace prompt.",
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

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /create key/i }));
    await userEvent.type(screen.getAllByPlaceholderText(/team-a/i).at(-1)!, "Profile Key");

    const profileSelect = screen.getByRole("combobox", { name: /permission config/i });
    await userEvent.click(profileSelect);
    await userEvent.click(await screen.findByRole("option", { name: /standard/i }));

    expect(screen.queryByText(/Daily request limit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/System prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /daily spending limit/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Create$/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalled();
    });

    expect(mocks.apiKeyEntriesReplace).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: "Existing Key" }),
      expect.objectContaining({
        name: "Profile Key",
        "permission-profile-id": "standard",
        "daily-limit": 15000,
        "total-quota": 0,
        "daily-spending-limit": 150,
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": [],
        "allowed-models": ["gpt-5.4"],
        "system-prompt": "Use the standard workspace prompt.",
      }),
    ]);
    expect(mocks.fetchConfigYaml).not.toHaveBeenCalled();
    expect(mocks.saveConfigYaml).not.toHaveBeenCalled();
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

  test("selects API keys and deletes them in batch", async () => {
    state.entries = [
      {
        id: "key-1",
        key: "sk-existing-1234567890",
        name: "Existing Key",
        "created-at": "2026-04-14T00:00:00.000Z",
      },
      {
        id: "key-2",
        key: "sk-second-1234567890",
        name: "Second Key",
        "created-at": "2026-04-15T00:00:00.000Z",
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

    expect(await screen.findByText("Existing Key")).toBeInTheDocument();
    expect(screen.getByText("Second Key")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Existing Key" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Second Key" }));

    expect(screen.queryByText("2 API keys selected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear selection/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /batch delete/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesDelete).toHaveBeenCalledTimes(2);
    });
    expect(mocks.apiKeyEntriesDelete).toHaveBeenNthCalledWith(1, {
      id: "key-1",
      key: undefined,
    });
    expect(mocks.apiKeyEntriesDelete).toHaveBeenNthCalledWith(2, {
      id: "key-2",
      key: undefined,
    });
    expect(screen.queryByText("Existing Key")).not.toBeInTheDocument();
    expect(screen.queryByText("Second Key")).not.toBeInTheDocument();
  });

  test("falls back to execCommand when async clipboard copy is blocked", async () => {
    const originalClipboard = navigator.clipboard;
    const originalExecCommand = document.execCommand;
    const writeText = vi.fn(async () => {
      throw new Error("clipboard blocked");
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    try {
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

      await userEvent.click(screen.getByRole("button", { name: /copy key/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith("sk-existing-1234567890");
        expect(execCommand).toHaveBeenCalledWith("copy");
      });
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
    }
  });

  test("opens CC Switch import card list and shows empty compatible state", async () => {
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

    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));

    const dialog = await screen.findByRole("dialog", { name: /import to cc switch/i });
    expect(dialog).toHaveTextContent(/select a cc switch preset to import/i);
    expect(dialog).toHaveTextContent(/no compatible cc switch configs found/i);
  });

  test("imports a compatible Codex CC Switch preset from the card list", async () => {
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
    state.ccSwitchImportConfigs = [
      {
        id: "preset-codex",
        "client-type": "codex",
        "provider-name": "Preset Codex",
        note: "Primary route",
        "default-model": "gpt-5.4",
        "allowed-channel-groups": ["pro", "team-a"],
        "route-path": "/pro/cs_codex",
        "endpoint-path": "/openai/v2",
        "usage-auto-interval": 45,
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

    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });
    await userEvent.click(screen.getByRole("button", { name: /preset codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-group-1234567890");
    expect(parsed.searchParams.get("name")).toBe("Preset Codex");
    expect(parsed.searchParams.get("endpoint")).toBe(
      "http://localhost:3000/pro/cs_codex/openai/v2",
    );
    expect(parsed.searchParams.get("model")).toBe("gpt-5.4");
    expect(parsed.searchParams.get("usageAutoInterval")).toBe("45");

    openSpy.mockRestore();
  });

  test("copies a compatible CC Switch preset link from the card list", async () => {
    const originalClipboard = navigator.clipboard;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    state.ccSwitchImportConfigs = [
      {
        id: "preset-codex",
        "client-type": "codex",
        "provider-name": "Preset Codex",
        note: "Primary route",
        "default-model": "gpt-5.4",
        "allowed-channel-groups": ["pro"],
        "route-path": "/pro/cs_codex",
        "endpoint-path": "/openai/v2",
        "usage-auto-interval": 45,
      },
    ];

    try {
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

      await openMoreActions();
      await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));
      await screen.findByRole("dialog", { name: /import to cc switch/i });

      await userEvent.click(screen.getByRole("button", { name: /copy import link/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ccswitch://v1/import?"));
      });
      expect(screen.getByRole("button", { name: /import link copied/i })).toBeInTheDocument();
      expect(openSpy).not.toHaveBeenCalled();

      const copiedUrl = String(writeText.mock.calls.at(-1)?.[0] ?? "");
      const parsed = new URL(copiedUrl);
      expect(parsed.searchParams.get("app")).toBe("codex");
      expect(parsed.searchParams.get("apiKey")).toBe("sk-group-1234567890");
      expect(parsed.searchParams.get("name")).toBe("Preset Codex");
      expect(parsed.searchParams.get("endpoint")).toBe(
        "http://localhost:3000/pro/cs_codex/openai/v2",
      );
      expect(parsed.searchParams.get("model")).toBe("gpt-5.4");
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  test("imports a saved Claude Code preset with auth field and model mappings", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    state.entries = [
      {
        key: "sk-claude-preset-1234567890",
        name: "Claude Preset Key",
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
    state.ccSwitchImportConfigs = [
      {
        id: "preset-claude",
        "client-type": "claude",
        "provider-name": "Preset Claude",
        note: "Role defaults",
        "default-model": "claude-sonnet-4-5",
        "allowed-channel-groups": ["team-a"],
        "route-path": "/team-a/cs_claude",
        "endpoint-path": "",
        "usage-auto-interval": 60,
        "api-key-field": "ANTHROPIC_AUTH_TOKEN",
        "model-mappings": [
          { role: "main", "request-model": "main", "target-model": "claude-sonnet-4-5" },
          { role: "haiku", "request-model": "haiku", "target-model": "claude-haiku-4-5" },
          { role: "sonnet", "request-model": "sonnet", "target-model": "claude-sonnet-4-5" },
          { role: "opus", "request-model": "opus", "target-model": "claude-opus-4-1" },
        ],
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

    expect(await screen.findByText("Claude Preset Key")).toBeInTheDocument();

    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    await userEvent.click(screen.getByRole("button", { name: /preset claude/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("app")).toBe("claude");
    expect(parsed.searchParams.get("name")).toBe("Preset Claude");
    expect(parsed.searchParams.get("endpoint")).toBe("http://localhost:3000/team-a/cs_claude");
    expect(parsed.searchParams.get("model")).toBe("claude-sonnet-4-5");
    expect(parsed.searchParams.get("haikuModel")).toBe("claude-haiku-4-5");
    expect(parsed.searchParams.get("sonnetModel")).toBe("claude-sonnet-4-5");
    expect(parsed.searchParams.get("opusModel")).toBe("claude-opus-4-1");
    expect(parsed.searchParams.get("apiKeyField")).toBe("ANTHROPIC_AUTH_TOKEN");

    openSpy.mockRestore();
  });

  test("filters CC Switch presets by the API key allowed channel groups", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    state.entries = [
      {
        key: "sk-preset-1234567890",
        name: "Preset Key",
        "allowed-channel-groups": ["team-a", "pro"],
        "created-at": "2026-04-14T00:00:00.000Z",
      },
    ];
    state.channelGroups = [
      {
        name: "team-a",
        description: "Team A route",
        "path-routes": ["/team-a"],
      },
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
      },
    ];
    state.ccSwitchImportConfigs = [
      {
        id: "preset-team",
        "client-type": "codex",
        "provider-name": "Team Codex",
        note: "Team route",
        "default-model": "gpt-5.4",
        "allowed-channel-groups": ["team-a"],
        "route-path": "/team-a/cs_team",
        "endpoint-path": "/v1",
        "usage-auto-interval": 30,
      },
      {
        id: "preset-enterprise",
        "client-type": "codex",
        "provider-name": "Enterprise Codex",
        note: "Blocked route",
        "default-model": "gpt-5.5",
        "allowed-channel-groups": ["enterprise"],
        "endpoint-path": "/v1",
        "usage-auto-interval": 30,
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

    expect(await screen.findByText("Preset Key")).toBeInTheDocument();

    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    expect(screen.getByRole("button", { name: /team codex/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enterprise codex/i })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /team codex/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining("ccswitch://v1/import?"),
        "_self",
      );
    });

    const openedUrl = String(openSpy.mock.calls.at(-1)?.[0] ?? "");
    const parsed = new URL(openedUrl);
    expect(parsed.searchParams.get("name")).toBe("Team Codex");
    expect(parsed.searchParams.get("endpoint")).toBe("http://localhost:3000/team-a/cs_team/v1");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.4");

    openSpy.mockRestore();
  });

  test("filters CC Switch presets by the API key target models", async () => {
    state.entries = [
      {
        key: "sk-limited-models-1234567890",
        name: "KimiCode+DeepSeek",
        "allowed-models": ["deepseek-v4-flash", "deepseek-v4-pro", "kimi-k2.5", "kimi-k2.6"],
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
    state.ccSwitchImportConfigs = [
      {
        id: "preset-deepseek-gpt",
        "client-type": "claude",
        "provider-name": "deepseek+gpt",
        note: "Uses a blocked main model",
        "default-model": "gpt-5.5",
        "allowed-channel-groups": ["team-a"],
        "model-mappings": [
          { role: "main", "request-model": "claude-opus-4-7", "target-model": "gpt-5.5" },
          {
            role: "haiku",
            "request-model": "claude-haiku-4-5",
            "target-model": "deepseek-v4-flash",
          },
        ],
      },
      {
        id: "preset-chatgpt-pro",
        "client-type": "claude",
        "provider-name": "chatgpt-pro",
        note: "Uses another blocked model",
        "default-model": "gpt-5.2",
        "allowed-channel-groups": ["team-a"],
      },
      {
        id: "preset-kimi-deepseek",
        "client-type": "claude",
        "provider-name": "Kimi+DeepSeek",
        note: "Allowed preset",
        "default-model": "kimi-k2.6",
        "allowed-channel-groups": ["team-a"],
        "model-mappings": [
          { role: "main", "request-model": "claude-opus-4-7", "target-model": "kimi-k2.6" },
          {
            role: "haiku",
            "request-model": "claude-haiku-4-5",
            "target-model": "deepseek-v4-flash",
          },
          {
            role: "sonnet",
            "request-model": "claude-sonnet-4-6",
            "target-model": "deepseek-v4-flash",
          },
          { role: "opus", "request-model": "claude-opus-4-7", "target-model": "kimi-k2.6" },
        ],
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

    expect(await screen.findByText("KimiCode+DeepSeek")).toBeInTheDocument();

    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /import to cc switch/i }));
    await screen.findByRole("dialog", { name: /import to cc switch/i });

    expect(screen.queryByRole("button", { name: /deepseek\+gpt/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /chatgpt-pro/i })).toBeNull();
    expect(screen.getByRole("button", { name: /kimi\+deepseek/i })).toBeInTheDocument();
  });

  test("resets today spending and refreshes the list", async () => {
    state.entries = [
      {
        id: "id-reset",
        key: "sk-reset-1",
        name: "Reset Me",
        "daily-spending-limit": 100,
        "daily-spending-used": 20,
        "daily-spending-remaining": 80,
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

    expect(await screen.findByText("Reset Me")).toBeInTheDocument();
    await openMoreActions();
    await userEvent.click(await screen.findByRole("menuitem", { name: /reset today spending/i }));
    await waitFor(() => {
      expect(mocks.apiKeyEntriesResetDailySpending).toHaveBeenCalledWith({ id: "id-reset" });
    });
    await waitFor(() => {
      expect(mocks.apiKeyEntriesList).toHaveBeenCalledTimes(2);
    });
  });
});
