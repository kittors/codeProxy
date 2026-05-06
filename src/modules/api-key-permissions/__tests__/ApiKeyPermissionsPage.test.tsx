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
}));

const mocks = vi.hoisted(() => ({
  apiKeyEntriesList: vi.fn(async () => state.entries),
  apiKeyEntriesReplace: vi.fn(async (entries: any[]) => {
    state.entries = entries;
    return {};
  }),
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
        "created-at": "2026-05-01T00:00:00.000Z",
      },
      {
        key: "sk-team-b-1234567890",
        name: "Team B",
        "total-quota": 200,
        "allowed-models": ["old-model"],
        "created-at": "2026-05-02T00:00:00.000Z",
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

  test("bulk updates selected API key permission fields without changing limits", async () => {
    renderPage();

    expect(await screen.findByText("API Key 权限配置")).toBeInTheDocument();
    expect(screen.getByText("Team A")).toBeInTheDocument();
    expect(screen.getByText("Team B")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "选择 Team A" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "选择 Team B" }));

    const editor = screen.getByRole("region", { name: "权限编辑器" });

    await userEvent.click(within(editor).getByRole("button", { name: /全部渠道分组/i }));
    await userEvent.click(await screen.findByRole("button", { name: /pro/i }));

    await userEvent.click(within(editor).getByRole("switch", { name: /精确渠道覆盖/i }));
    await userEvent.click(within(editor).getByRole("button", { name: /全部渠道/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Claude渠道/i }));

    await waitFor(() => {
      expect(mocks.apiClientGet).toHaveBeenCalledWith(
        expect.stringContaining("allowed_channel_groups=pro"),
      );
    });

    await userEvent.click(within(editor).getByRole("button", { name: /全部模型/i }));
    await userEvent.click(await screen.findByRole("button", { name: /claude-sonnet-4-5/i }));

    await userEvent.click(screen.getByRole("button", { name: /保存权限/i }));

    await waitFor(() => {
      expect(mocks.apiKeyEntriesReplace).toHaveBeenCalled();
    });

    expect(mocks.apiKeyEntriesReplace).toHaveBeenLastCalledWith([
      expect.objectContaining({
        name: "Team A",
        "daily-limit": 100,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": ["Claude渠道"],
        "allowed-models": ["claude-sonnet-4-5"],
      }),
      expect.objectContaining({
        name: "Team B",
        "total-quota": 200,
        "allowed-channel-groups": ["pro"],
        "allowed-channels": ["Claude渠道"],
        "allowed-models": ["claude-sonnet-4-5"],
      }),
    ]);
  });
});
