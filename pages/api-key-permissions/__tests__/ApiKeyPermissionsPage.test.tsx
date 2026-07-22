import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import type { EndUser, EndUserUpdateBody } from "@code-proxy/api-client/endpoints/end-users";
import { ApiKeyPermissionsPage } from "../ApiKeyPermissionsPage";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";

interface ChannelGroupFixture {
  name: string;
  description: string;
  channels: string[];
}

const state = vi.hoisted(() => ({
  accounts: [] as EndUser[],
  channelGroups: [] as ChannelGroupFixture[],
  permissionProfiles: [] as ApiKeyPermissionProfile[],
}));

const mocks = vi.hoisted(() => ({
  endUsersList: vi.fn(async () => ({ items: state.accounts })),
  endUsersUpdate: vi.fn(async (id: string, body: EndUserUpdateBody) => {
    const current = state.accounts.find((account) => account.id === id);
    if (!current) throw new Error(`missing account ${id}`);
    const updated: EndUser = {
      ...current,
      ...body,
      "period-spending-limits": body["period-spending-limits"]
        ? {
            "5h":
              body["period-spending-limits"]["5h"] ??
              current["period-spending-limits"]?.["5h"] ??
              0,
            day: body["period-spending-limits"].day ?? current["period-spending-limits"]?.day ?? 0,
            week:
              body["period-spending-limits"].week ?? current["period-spending-limits"]?.week ?? 0,
            month:
              body["period-spending-limits"].month ?? current["period-spending-limits"]?.month ?? 0,
          }
        : current["period-spending-limits"],
    };
    state.accounts = state.accounts.map((account) => (account.id === id ? updated : account));
    return updated;
  }),
  apiClientPut: vi.fn(async (url: string, body: unknown) => {
    if (url === "/api-key-permission-profiles") {
      const items = Array.isArray(body)
        ? body
        : ((body as { items?: ApiKeyPermissionProfile[] } | null)?.items ?? []);
      state.permissionProfiles = items;
    }
    return { applied_count: 2, "capped-keys": [] };
  }),
  authFilesList: vi.fn(async () => ({ files: [] })),
  getGeminiKeys: vi.fn(async (): Promise<unknown[]> => []),
  getClaudeConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getCodexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenCodeGoConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getClineConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOllamaCloudConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getVertexConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getOpenAIProviders: vi.fn(async (): Promise<unknown[]> => []),
  apiClientGet: vi.fn(async (url: string) => {
    if (url === "/api-key-permission-profiles") {
      return { "api-key-permission-profiles": state.permissionProfiles };
    }
    if (url === "/channel-groups") return { items: state.channelGroups };
    if (url.includes("allowed_channel_groups=pro")) {
      return { data: [{ id: "claude-sonnet-4-5" }, { id: "gpt-5.4" }] };
    }
    return { data: [{ id: "gpt-4.1" }] };
  }),
}));

vi.mock("@code-proxy/api-client/endpoints/end-users", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client/endpoints/end-users")>();
  return {
    ...mod,
    endUsersApi: {
      ...mod.endUsersApi,
      list: mocks.endUsersList,
      update: mocks.endUsersUpdate,
    },
  };
});

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
      replace: async (
        profiles: ApiKeyPermissionProfile[],
        options?: { syncAccounts?: boolean },
      ) => {
        const response = await mocks.apiClientPut(
          "/api-key-permission-profiles",
          options?.syncAccounts ? { items: profiles, "sync-accounts": true } : profiles,
        );
        return {
          appliedCount: response.applied_count,
          cappedKeys: response["capped-keys"] ?? [],
        };
      },
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
      getOpenCodeGoConfigs: mocks.getOpenCodeGoConfigs,
      getClineConfigs: mocks.getClineConfigs,
      getOllamaCloudConfigs: mocks.getOllamaCloudConfigs,
      getVertexConfigs: mocks.getVertexConfigs,
      getOpenAIProviders: mocks.getOpenAIProviders,
    },
  };
});

function account(id: string, displayName: string, profileId = ""): EndUser {
  return {
    id,
    tenant_id: "tenant-1",
    username: id,
    display_name: displayName,
    status: "active",
    must_change_password: false,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    version: 1,
    "permission-profile-id": profileId,
  };
}

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ApiKeyPermissionsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ApiKeyPermissionsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    state.accounts = [
      account("user-a", "Team A", "standard"),
      account("user-b", "Team B"),
      account("user-c", "Team C", "standard"),
    ];
    state.permissionProfiles = [
      {
        id: "standard",
        name: "标准配置",
        "daily-limit": 15000,
        "total-quota": 0,
        "daily-spending-limit": 0,
        "period-spending-limits": { "5h": 100, day: 300, week: 800, month: 4000 },
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": ["legacy"],
        "allowed-channels": [],
        "allowed-models": [],
        "system-prompt": "标准系统提示词",
      },
    ];
    state.channelGroups = [
      { name: "pro", description: "Pro pool", channels: ["Claude渠道", "Claude备用"] },
      { name: "legacy", description: "Legacy pool", channels: ["Legacy渠道"] },
    ];
    vi.clearAllMocks();
    mocks.getGeminiKeys.mockResolvedValue([]);
    mocks.getClaudeConfigs.mockResolvedValue([{ name: "Claude渠道" }, { name: "Claude备用" }]);
    mocks.getCodexConfigs.mockResolvedValue([]);
    mocks.getOpenCodeGoConfigs.mockResolvedValue([]);
    mocks.getClineConfigs.mockResolvedValue([]);
    mocks.getOllamaCloudConfigs.mockResolvedValue([]);
    mocks.getVertexConfigs.mockResolvedValue([]);
    mocks.getOpenAIProviders.mockResolvedValue([]);
  });

  test("manages reusable account permission profiles", async () => {
    renderPage();

    expect(await screen.findByText("标准配置")).toBeInTheDocument();
    expect(screen.queryByText("Team A")).not.toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.getByText("$800")).toBeInTheDocument();
    expect(screen.getByText("$4,000")).toBeInTheDocument();
    expect(screen.getByText("分组 1 · 渠道 无限制 · 模型 无限制")).toBeInTheDocument();
    expect(screen.getByText("已绑定 2 个账号")).toBeInTheDocument();
    expect(screen.getByText("标准系统提示词")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "新增配置" }));
    const dialog = await screen.findByRole("dialog", { name: "新增权限配置" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "配置名称" }), "专业配置");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "每日请求限额" }), "15000");
    await userEvent.type(
      within(dialog).getByRole("spinbutton", { name: "5 小时额度 (USD)" }),
      "100",
    );
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "每日额度 (USD)" }), "300");
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "系统提示词" }),
      "专业系统提示词",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /全部渠道分组/i }));
    await userEvent.click(await screen.findByRole("button", { name: /pro/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mocks.apiClientPut).toHaveBeenCalledWith(
        "/api-key-permission-profiles",
        expect.objectContaining({
          "sync-accounts": true,
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "专业配置",
              "daily-limit": 15000,
              "daily-spending-limit": 300,
              "period-spending-limits": { "5h": 100, day: 300, week: 0, month: 0 },
              "allowed-channel-groups": ["pro"],
              "system-prompt": "专业系统提示词",
            }),
          ]),
        }),
      );
    });
    expect(mocks.endUsersUpdate).not.toHaveBeenCalled();
  });

  test("applies an edited profile through one atomic server request", async () => {
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑权限配置" });
    const dailyLimit = within(dialog).getByRole("spinbutton", { name: "每日请求限额" });
    await userEvent.clear(dailyLimit);
    await userEvent.type(dailyLimit, "16000");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mocks.apiClientPut).toHaveBeenCalledWith(
        "/api-key-permission-profiles",
        expect.objectContaining({
          "sync-accounts": true,
          items: expect.arrayContaining([
            expect.objectContaining({
              id: "standard",
              "daily-limit": 16000,
            }),
          ]),
        }),
      );
    });
    expect(mocks.endUsersUpdate).not.toHaveBeenCalled();
  });

  test("loads provider channels from OpenCode Go, ClinePass and Ollama Cloud configs", async () => {
    mocks.getOpenCodeGoConfigs.mockResolvedValue([{ name: "OpenCode Go 主渠道" }]);
    mocks.getClineConfigs.mockResolvedValue([{ name: "ClinePass 主渠道" }]);
    mocks.getOllamaCloudConfigs.mockResolvedValue([{ name: "Ollama Cloud 主渠道" }]);

    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "新增配置" }));
    const dialog = await screen.findByRole("dialog", { name: "新增权限配置" });
    await userEvent.click(within(dialog).getByRole("switch", { name: "精确渠道覆盖（高级）" }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^全部渠道$/i }));

    expect(await screen.findByRole("button", { name: /OpenCode Go 主渠道/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ClinePass 主渠道/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ollama Cloud 主渠道/i })).toBeInTheDocument();
  });
});
