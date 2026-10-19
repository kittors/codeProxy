import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import type { EndUser } from "@code-proxy/api-client/endpoints/end-users";
import type { AccessPolicyCapabilities } from "@code-proxy/api-client/endpoints/access-policy";
import { ApiKeyPermissionsPage } from "../ApiKeyPermissionsPage";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";

interface ChannelGroupFixture {
  name: string;
  description: string;
  channels: string[];
}

const FULL: AccessPolicyCapabilities = {
  accessPolicy: true,
  modelFallback: true,
  batchProfileBinding: true,
  createWithProfile: true,
  ownedKeyAdmin: true,
};

const NONE: AccessPolicyCapabilities = {
  accessPolicy: false,
  modelFallback: false,
  batchProfileBinding: false,
  createWithProfile: false,
  ownedKeyAdmin: false,
};

const state = vi.hoisted(() => ({
  accounts: [] as EndUser[],
  channelGroups: [] as ChannelGroupFixture[],
  permissionProfiles: [] as unknown[],
  capabilities: null as AccessPolicyCapabilities | null,
}));

const mocks = vi.hoisted(() => ({
  endUsersList: vi.fn(async () => ({ items: state.accounts })),
  replace: vi.fn(),
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
    if (url === "/channel-groups") return { items: state.channelGroups };
    if (url.includes("allowed_channel_groups=pro")) {
      return { data: [{ id: "claude-sonnet-4-5" }, { id: "gpt-5.4" }] };
    }
    return { data: [{ id: "gpt-4.1" }, { id: "claude-opus-4-5" }, { id: "claude-sonnet-4-5" }] };
  }),
}));

vi.mock("@code-proxy/api-client/endpoints/end-users", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client/endpoints/end-users")>();
  return { ...mod, endUsersApi: { ...mod.endUsersApi, list: mocks.endUsersList } };
});

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: { list: vi.fn(async () => state.channelGroups) },
}));

// 列表与保存走真实的归一化与序列化，只把网络请求换成记录下来的请求体。
vi.mock("@code-proxy/api-client/endpoints/api-key-permission-profiles", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@code-proxy/api-client/endpoints/api-key-permission-profiles")>();
  return {
    ...mod,
    apiKeyPermissionProfilesApi: {
      listDetailed: async () => ({
        items: mod.normalizeApiKeyPermissionProfiles(state.permissionProfiles),
        capabilities: state.capabilities,
      }),
      replace: async (profiles: ApiKeyPermissionProfile[], options?: { syncAccounts?: boolean; accessPolicy?: boolean }) => {
        const items = profiles.map((profile) =>
          mod.serializeApiKeyPermissionProfile(profile, { accessPolicy: options?.accessPolicy }),
        );
        mocks.replace(items, options);
        state.permissionProfiles = items;
        return { appliedCount: 2, cappedKeys: [], cappedCells: [] };
      },
    },
  };
});

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    apiClient: { get: mocks.apiClientGet },
    authFilesApi: { ...mod.authFilesApi, list: mocks.authFilesList },
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
  } as EndUser;
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

const savedItems = () => mocks.replace.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>;
const openSection = (dialog: HTMLElement, name: RegExp) =>
  userEvent.click(within(dialog).getByRole("tab", { name }));

describe("ApiKeyPermissionsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    state.capabilities = FULL;
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
        "period-spending-limits": { "5h": 100, day: 300, week: 800, month: 4000 },
        "allowed-channel-groups": ["legacy"],
        "system-prompt": "标准系统提示词",
        "model-rules": [
          { id: "opus", name: "Opus 周额度", models: ["claude-opus-*"], limits: { requests: { week: 200 } } },
        ],
      },
    ];
    state.channelGroups = [
      { name: "pro", description: "Pro pool", channels: ["Claude渠道", "Claude备用"] },
      { name: "legacy", description: "Legacy pool", channels: ["Legacy渠道"] },
    ];
    vi.clearAllMocks();
    mocks.getClaudeConfigs.mockResolvedValue([{ name: "Claude渠道" }, { name: "Claude备用" }]);
  });

  test("each template card reads its limits, rules, scope and how many accounts use it", async () => {
    renderPage();

    expect(await screen.findByText("标准配置")).toBeInTheDocument();
    expect(screen.queryByText("Team A")).not.toBeInTheDocument();
    for (const amount of ["$100", "$300", "$800", "$4K", "15K"]) {
      expect(screen.getByText(amount)).toBeInTheDocument();
    }
    expect(screen.getByText("2 个账号")).toBeInTheDocument();
    expect(screen.getByText("1 条规则")).toBeInTheDocument();
    expect(screen.getByText("渠道分组 1")).toBeInTheDocument();
    expect(screen.getByText("标准系统提示词")).toBeInTheDocument();
  });

  test("creates a template with matrix cells, a scope and a prompt", async () => {
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "新增模板" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "新增权限模板" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "模板名称" }), "专业配置");

    await openSection(dialog, /额度/);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "花费 · 5 小时" }), "100");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "花费 · 每日" }), "300");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "请求次数 · 每日" }), "15000");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Token 用量 · 每月" }), "50M");
    // 累计消费不属于模板。
    expect(within(dialog).queryByRole("textbox", { name: "花费 · 累计" })).toBeNull();

    await openSection(dialog, /访问范围/);
    const channelGroups = within(dialog).getByRole("combobox", { name: /允许的渠道分组/ });
    expect(channelGroups).toHaveTextContent("全部渠道分组");
    await userEvent.click(channelGroups);
    await userEvent.click(await screen.findByRole("button", { name: /pro/i }));

    await openSection(dialog, /速率与提示词/);
    await userEvent.type(within(dialog).getByRole("textbox", { name: "系统提示词" }), "专业系统提示词");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存模板" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    const created = savedItems().find((item) => item.name === "专业配置")!;
    expect(created).toMatchObject({
      "daily-limit": 15000,
      "daily-spending-limit": 300,
      "period-spending-limits": { "5h": 100, day: 300, week: 0, month: 0 },
      "allowed-channel-groups": ["pro"],
      "system-prompt": "专业系统提示词",
    });
    expect((created["quota-limits"] as { tokens: { month: number } }).tokens.month).toBe(50_000_000);
    expect(mocks.replace.mock.calls.at(-1)?.[1]).toEqual({ syncAccounts: true, accessPolicy: true });
  });

  test("edits a template's rule and keeps the others intact", async () => {
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "编辑「标准配置」" }));
    const dialog = await screen.findByRole("dialog", { name: "编辑权限模板" });
    expect(within(dialog).getByText("保存后同步到 2 个绑定账号")).toBeInTheDocument();

    await openSection(dialog, /模型规则/);
    const weekly = within(dialog).getByRole("textbox", { name: "请求次数 · 每周" });
    await userEvent.clear(weekly);
    await userEvent.type(weekly, "300");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存模板" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    const [standard] = savedItems();
    expect(standard).toMatchObject({ id: "standard", "daily-limit": 15000 });
    expect(standard["model-rules"]).toEqual([
      expect.objectContaining({ id: "opus", models: ["claude-opus-*"], limits: expect.objectContaining({ requests: expect.objectContaining({ week: 300 }) }) }),
    ]);
  });

  test("duplicates a template as a starting point", async () => {
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "复制「标准配置」" }));
    const dialog = await screen.findByRole("dialog", { name: "新增权限模板" });
    expect(within(dialog).getByRole("textbox", { name: "模板名称" })).toHaveValue("标准配置 副本");
    await userEvent.click(within(dialog).getByRole("button", { name: "保存模板" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    const items = savedItems();
    expect(items).toHaveLength(2);
    const copy = items[1]!;
    expect(copy.id).not.toBe("standard");
    expect(copy).toMatchObject({ name: "标准配置 副本", "daily-limit": 15000 });
    // 复制出来的规则换新 id，由后端重新生成。
    expect(copy["model-rules"]).toEqual([expect.objectContaining({ id: "", name: "Opus 周额度" })]);
  });

  test("flags a missing name in place and spells out what a delete does", async () => {
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "新增模板" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "新增权限模板" });
    await userEvent.click(within(dialog).getByRole("button", { name: "保存模板" }));
    expect(within(dialog).getByText("这一项必填")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新增权限模板" })).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "删除「标准配置」" }));
    const confirm = await screen.findByRole("dialog", { name: "删除权限模板" });
    expect(within(confirm).getByText("标准配置")).toBeInTheDocument();
    expect(within(confirm).getByText("已绑定 2 个账号")).toBeInTheDocument();
    expect(within(confirm).getByText(/转为单独设置/)).toBeInTheDocument();
    expect(within(confirm).getByRole("button", { name: "删除模板" })).toBeInTheDocument();
  });

  test("an old backend only offers the cells it can store and no rules", async () => {
    state.capabilities = NONE;
    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "新增模板" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "新增权限模板" });
    expect(within(dialog).queryByRole("tab", { name: /模型规则/ })).toBeNull();
    await openSection(dialog, /额度/);
    expect(within(dialog).queryByRole("textbox", { name: "Token 用量 · 每日" })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "花费 · 每日" })).toBeEnabled();
  });

  test("loads provider channels from OpenCode Go, ClinePass and Ollama Cloud configs", async () => {
    mocks.getOpenCodeGoConfigs.mockResolvedValue([{ name: "OpenCode Go 主渠道" }]);
    mocks.getClineConfigs.mockResolvedValue([{ name: "ClinePass 主渠道" }]);
    mocks.getOllamaCloudConfigs.mockResolvedValue([{ name: "Ollama Cloud 主渠道" }]);

    renderPage();
    expect(await screen.findByText("标准配置")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "新增模板" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "新增权限模板" });
    await openSection(dialog, /访问范围/);
    await userEvent.click(within(dialog).getByRole("switch", { name: "精确渠道覆盖（高级）" }));
    await userEvent.click(within(dialog).getByRole("combobox", { name: /^允许的渠道（/ }));

    expect(await screen.findByRole("button", { name: /OpenCode Go 主渠道/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ClinePass 主渠道/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ollama Cloud 主渠道/i })).toBeInTheDocument();
  });
});
