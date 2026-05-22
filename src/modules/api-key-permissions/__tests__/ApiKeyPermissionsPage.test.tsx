import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ApiKeyPermissionsPage } from "@/modules/api-key-permissions/ApiKeyPermissionsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const state = vi.hoisted(() => ({
  entries: [] as any[],
  channelGroups: [] as any[],
  configYaml: "",
  permissionProfiles: [] as any[],
}));

const mocks = vi.hoisted(() => ({
  apiKeyEntriesList: vi.fn(async () => state.entries),
  apiKeyEntriesReplace: vi.fn(async (entries: any[]) => {
    state.entries = entries;
    return {};
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
    return {};
  }),
  authFilesList: vi.fn(async () => ({ files: [] })),
  getGeminiKeys: vi.fn(async () => []),
  getClaudeConfigs: vi.fn(async () => []),
  getCodexConfigs: vi.fn(async () => []),
  getVertexConfigs: vi.fn(async () => []),
  getOpenAIProviders: vi.fn(async () => []),
  apiClientGet: vi.fn(async (url: string) => {
    if (url === "/api-key-permission-profiles") {
      return { "api-key-permission-profiles": state.permissionProfiles };
    }
    if (url === "/channel-groups") {
      return { items: state.channelGroups };
    }
    if (url.includes("allowed_channel_groups=pro")) {
      return { data: [{ id: "claude-sonnet-4-5" }, { id: "gpt-5.4" }] };
    }
    return { data: [{ id: "gpt-4.1" }] };
  }),
}));

vi.mock("@/lib/http/apis/api-keys", () => ({
  apiKeyEntriesApi: {
    list: mocks.apiKeyEntriesList,
    replace: mocks.apiKeyEntriesReplace,
  },
}));

vi.mock("@/lib/http/apis/config-file", () => ({
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

vi.mock("@/lib/http/apis/channel-groups", () => ({
  channelGroupsApi: {
    list: vi.fn(async () => state.channelGroups),
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
    put: mocks.apiClientPut,
  },
}));

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
    state.entries = [
      {
        key: "sk-team-a-1234567890",
        name: "Team A",
        "daily-limit": 100,
        "allowed-channel-groups": ["legacy"],
        "permission-profile-id": "standard",
        "created-at": "2026-05-01T00:00:00.000Z",
      },
      {
        key: "sk-team-b-1234567890",
        name: "Team B",
        "total-quota": 200,
        "allowed-models": ["old-model"],
        "created-at": "2026-05-02T00:00:00.000Z",
      },
      {
        key: "sk-team-c-1234567890",
        name: "Team C",
        "daily-limit": 15000,
        "allowed-channel-groups": ["legacy"],
        "system-prompt": "标准系统提示词",
        "created-at": "2026-05-03T00:00:00.000Z",
      },
    ];
    state.configYaml = "";
    state.permissionProfiles = [
      {
        id: "standard",
        name: "标准配置",
        "daily-limit": 15000,
        "total-quota": 0,
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
      {
        name: "pro",
        description: "Pro pool",
        channels: ["Claude渠道", "Claude备用"],
      },
      {
        name: "legacy",
        description: "Legacy pool",
        channels: ["Legacy渠道"],
      },
    ];
    mocks.apiKeyEntriesList.mockClear();
    mocks.apiKeyEntriesReplace.mockClear();
    mocks.fetchConfigYaml.mockClear();
    mocks.saveConfigYaml.mockClear();
    mocks.apiClientPut.mockClear();
    mocks.authFilesList.mockClear();
    mocks.getGeminiKeys.mockResolvedValue([]);
    mocks.getClaudeConfigs.mockResolvedValue([
      { name: "Claude渠道" },
      { name: "Claude备用" },
    ] as any);
    mocks.getCodexConfigs.mockResolvedValue([]);
    mocks.getVertexConfigs.mockResolvedValue([]);
    mocks.getOpenAIProviders.mockResolvedValue([]);
    mocks.apiClientGet.mockClear();
  });

  test("manages permission configs as a reusable profile list", async () => {
    renderPage();

    expect(await screen.findByText("标准配置")).toBeInTheDocument();
    expect(screen.queryByText("Team A")).not.toBeInTheDocument();
    expect(screen.getByText("每日 15,000")).toBeInTheDocument();
    expect(screen.getByText("分组 1 · 渠道 无限制 · 模型 无限制")).toBeInTheDocument();
    expect(screen.getByText("已绑定 2 个")).toBeInTheDocument();
    expect(screen.getByText("标准系统提示词")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "新增配置" }));
    const dialog = await screen.findByRole("dialog", { name: "新增权限配置" });

    await userEvent.type(within(dialog).getByRole("textbox", { name: "配置名称" }), "专业配置");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "每日请求限额" }), "15000");
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
        expect.arrayContaining([
          expect.objectContaining({
            name: "专业配置",
            "daily-limit": 15000,
            "total-quota": 0,
            "concurrency-limit": 0,
            "rpm-limit": 0,
            "tpm-limit": 0,
            "allowed-channel-groups": ["pro"],
            "allowed-channels": [],
            "allowed-models": [],
            "system-prompt": "专业系统提示词",
          }),
        ]),
      );
    });
    expect(mocks.fetchConfigYaml).not.toHaveBeenCalled();
    expect(mocks.saveConfigYaml).not.toHaveBeenCalled();
  });

  test("updates API keys that are explicitly or historically bound to an edited profile", async () => {
    renderPage();

    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑权限配置" });
    const dailyLimit = within(dialog).getByRole("spinbutton", { name: "每日请求限额" });
    await userEvent.clear(dailyLimit);
    await userEvent.type(dailyLimit, "16000");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Team A",
            "permission-profile-id": "standard",
            "daily-limit": 16000,
          }),
          expect.objectContaining({
            name: "Team C",
            "permission-profile-id": "standard",
            "daily-limit": 16000,
          }),
        ]),
      );
    });
  });

  test("refreshes stale API key entries before applying edited profile channels", async () => {
    const staleEntries = [
      {
        key: "sk-bound-1234567890",
        name: "Bound Key",
        "daily-limit": 15000,
        "permission-profile-id": "standard",
        "created-at": "2026-05-04T00:00:00.000Z",
      },
      {
        key: "sk-unbound-1234567890",
        name: "Unbound Key",
        "allowed-channels": ["kimi-A"],
        "created-at": "2026-05-05T00:00:00.000Z",
      },
    ];
    const freshEntries = [
      {
        ...staleEntries[0],
      },
      {
        ...staleEntries[1],
        "allowed-channels": [],
      },
    ];
    state.entries = staleEntries;
    state.permissionProfiles = [
      {
        id: "standard",
        name: "标准配置",
        "daily-limit": 15000,
        "total-quota": 0,
        "concurrency-limit": 0,
        "rpm-limit": 0,
        "tpm-limit": 0,
        "allowed-channel-groups": [],
        "allowed-channels": [],
        "allowed-models": [],
        "system-prompt": "",
      },
    ];
    mocks.apiKeyEntriesList
      .mockResolvedValueOnce(staleEntries)
      .mockResolvedValueOnce(freshEntries);

    renderPage();

    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑权限配置" });
    const dailyLimit = within(dialog).getByRole("spinbutton", { name: "每日请求限额" });
    await userEvent.clear(dailyLimit);
    await userEvent.type(dailyLimit, "16000");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesList).toHaveBeenCalledTimes(2);
      expect(mocks.apiClientPut).toHaveBeenCalledWith(
        "/api-key-permission-profiles",
        expect.arrayContaining([
          expect.objectContaining({
            id: "standard",
            "allowed-channels": [],
          }),
        ]),
      );
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Bound Key",
            "permission-profile-id": "standard",
            "daily-limit": 16000,
          }),
          expect.objectContaining({
            name: "Unbound Key",
            "allowed-channels": [],
          }),
        ]),
      );
      expect(JSON.stringify(mocks.apiKeyEntriesReplace.mock.calls[0][0])).not.toContain("kimi-A");
    });
  });
});
