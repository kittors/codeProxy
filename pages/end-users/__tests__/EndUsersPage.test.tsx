import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  emptyQuotaMatrix,
  normalizeEndUser,
  type AccessFreeze,
  type AccessPolicyCapabilities,
  type ApiKeyPermissionProfile,
  type ApiKeyPermissionProfileList,
  type EndUser,
} from "@code-proxy/api-client";
import { EndUsersPage } from "../EndUsersPage";

const FULL: AccessPolicyCapabilities = {
  accessPolicy: true,
  modelFallback: true,
  batchProfileBinding: true,
  createWithProfile: true,
  ownedKeyAdmin: true,
  accessFreezes: false,
};

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  bindProfile: vi.fn(),
  resetPeriodSpending: vi.fn(),
  listDailySpendingResetHistory: vi.fn(),
  getUsageLogs: vi.fn(),
  freezes: vi.fn(),
  freezeStrikes: vi.fn(),
  keyEntries: vi.fn(),
  profiles: vi.fn(async (): Promise<ApiKeyPermissionProfileList> => ({ items: [], capabilities: {} as never })),
}));

// Permissions the signed-in admin lacks; a plain set, so a mock reset leaves it alone.
const denied = vi.hoisted(() => new Set<string>());

vi.mock("@app/providers/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({ can: (permission: string) => !denied.has(permission) }),
}));

// 渠道、分组与模型选项只在打开弹窗时才拉；这里给空选项，不发真实请求。
vi.mock("@features/api-key-restrictions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/api-key-restrictions")>()),
  useApiKeyPermissionOptions: () => ({
    availableModels: [],
    availableChannels: [],
    availableChannelGroups: [],
    channelRouteGroupsByName: {},
    fetchModelOptions: async () => [],
    loadModels: async () => [],
    refreshPermissionOptions: async () => undefined,
  }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    apiKeyPermissionProfilesApi: { ...actual.apiKeyPermissionProfilesApi, listDetailed: mocks.profiles },
    usageApi: { ...actual.usageApi, getUsageLogs: mocks.getUsageLogs },
    accessFreezesApi: { ...actual.accessFreezesApi, list: mocks.freezes, strikes: mocks.freezeStrikes },
    apiKeyEntriesApi: { ...actual.apiKeyEntriesApi, list: mocks.keyEntries },
    endUsersApi: {
      ...actual.endUsersApi,
      list: mocks.list,
      update: mocks.update,
      bindProfile: mocks.bindProfile,
      resetPeriodSpending: mocks.resetPeriodSpending,
      listDailySpendingResetHistory: mocks.listDailySpendingResetHistory,
    },
  };
});

const goldLimits = emptyQuotaMatrix();
goldLimits.cost.day = 300;
goldLimits.requests.week = 800;
const opusLimits = emptyQuotaMatrix();
opusLimits.requests.week = 100;

const gold: ApiKeyPermissionProfile = {
  id: "gold",
  name: "Gold",
  "daily-limit": 0,
  "total-quota": 0,
  "daily-spending-limit": 300,
  "period-spending-limits": { "5h": 0, day: 300, week: 0, month: 0 },
  "concurrency-limit": 0,
  "rpm-limit": 0,
  "tpm-limit": 0,
  "allowed-channel-groups": [],
  "allowed-channels": [],
  "allowed-models": [],
  "system-prompt": "",
  "quota-limits": goldLimits,
  "model-rules": [{ id: "opus", name: "Opus weekly", models: ["claude-opus-*"], limits: opusLimits }],
  "model-routes": [],
};

const base = {
  tenant_id: "tenant-1",
  must_change_password: false,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  version: 1,
};

const usedBob = emptyQuotaMatrix();
usedBob.cost.day = 120;
usedBob.requests.week = 200;
const usedOpus = emptyQuotaMatrix();
usedOpus.requests.week = 100;

const lifetimeOnly = emptyQuotaMatrix();
lifetimeOnly.cost.lifetime = 100;
const usedCarol = emptyQuotaMatrix();
usedCarol.cost.lifetime = 12;

const users: EndUser[] = [
  normalizeEndUser({
    ...base,
    id: "user-active",
    username: "alice",
    display_name: "Alice",
    status: "active",
    api_key_count: 2,
    "daily-spending-used": 12,
    "lifetime-spending-used": 88.7,
  }),
  normalizeEndUser({
    ...base,
    id: "user-frozen",
    username: "bob",
    display_name: "Bob",
    status: "locked",
    api_key_count: 1,
    last_login_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    "daily-spending-used": 120,
    "lifetime-spending-used": 912.34,
    "daily-spending-reset-count": 2,
    "permission-profile-id": "gold",
    "rpm-limit": 60,
    "quota-limits": goldLimits,
    "model-rules": gold["model-rules"],
    "quota-usage": { total: usedBob, rules: [{ id: "opus", used: usedOpus }] },
  }),
  normalizeEndUser({
    ...base,
    id: "user-carol",
    username: "carol",
    display_name: "Carol",
    status: "active",
    "spending-limit": 100,
    "lifetime-spending-used": 12,
    "quota-limits": lifetimeOnly,
    "quota-usage": { total: usedCarol, rules: [] },
  }),
];

function renderPage() {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ToastProvider>
          <EndUsersPage />
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

async function openRowMoreActions(name: string) {
  await userEvent.click(within(rowOf(name)).getByRole("button", { name: "More actions" }));
}

describe("EndUsersPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    denied.clear();
    window.localStorage.clear();
    await i18n.changeLanguage("en");
    mocks.freezes.mockResolvedValue([]);
    mocks.freezeStrikes.mockResolvedValue([]);
    mocks.keyEntries.mockResolvedValue([]);
    mocks.list.mockResolvedValue({ items: users, capabilities: FULL });
    mocks.profiles.mockResolvedValue({ items: [gold], capabilities: FULL });
    mocks.update.mockResolvedValue(users[0]);
    mocks.bindProfile.mockResolvedValue({ updated: 2 });
    mocks.resetPeriodSpending.mockResolvedValue({ status: "ok" });
    mocks.getUsageLogs.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      stats: { total: 0, success_rate: 0, total_tokens: 0 },
      filters: { api_keys: [], api_key_names: {}, models: [], channels: [] },
    });
    mocks.listDailySpendingResetHistory.mockResolvedValue({
      items: [{ id: 42, day_key: "2026-07-21", reset_at: "2026-07-21T11:00:00Z", actor_kind: "service_credential" }],
      total: 1,
      "raw-today-cost": 175.5,
      "daily-spending-used": 28.25,
    });
  });

  test("one row reads the source, the tightest limits, model policy, spend and rate", async () => {
    renderPage();
    expect(await screen.findByText("Alice")).toBeInTheDocument();

    for (const header of ["Permission source", "Quota usage", "Model policy", "Spend", "Rate limits"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    const alice = rowOf("Alice");
    expect(within(alice).getByText("Individual")).toBeInTheDocument();
    expect(within(alice).getByText("Unlimited")).toBeInTheDocument();
    expect(within(alice).getByText("Never signed in")).toBeInTheDocument();
    expect(within(alice).getByText("$88.70")).toBeInTheDocument();

    const bob = rowOf("Bob");
    expect(within(bob).getByText("Gold")).toBeInTheDocument();
    expect(within(bob).getByText("Frozen")).toBeInTheDocument();
    expect(within(bob).getByText("Signed in 3 days ago")).toBeInTheDocument();
    expect(within(bob).getByText("$120 / $300")).toBeInTheDocument();
    expect(within(bob).getByText("200 / 800")).toBeInTheDocument();
    expect(within(bob).getByText("60 RPM")).toBeInTheDocument();
    // 规则已用满：胶囊变成警告色，读屏也能听到。
    expect(within(bob).getByText("1 rule")).toBeInTheDocument();
    expect(within(bob).getByText("1 of these rules has a limit used up")).toBeInTheDocument();

    // 只有累计额度的账号不能读成「不限制」。
    const carol = rowOf("Carol");
    expect(within(carol).getByText("$12 / $100")).toBeInTheDocument();
    expect(within(carol).queryByText("Unlimited")).toBeNull();
  });

  test("an account's requests in flight show next to what it used, in the list and the editor", async () => {
    const busyCarol = normalizeEndUser({
      ...base,
      id: "user-carol",
      username: "carol",
      display_name: "Carol",
      status: "active",
      "quota-limits": lifetimeOnly,
      "quota-usage": { total: usedCarol, rules: [], "in-flight": { requests: 2, tokens: 0, cost: 3 } },
    });
    mocks.list.mockResolvedValue({ items: [users[0], users[1], busyCarol], capabilities: FULL });
    renderPage();
    await screen.findByText("Carol");
    expect(
      within(rowOf("Carol")).getByTitle("Spend · Total: $12 used of $100, plus $3 reserved by requests in flight"),
    ).toBeInTheDocument();

    await userEvent.click(within(rowOf("Carol")).getByRole("button", { name: "Edit user account" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit user account" });
    await userEvent.click(within(dialog).getByRole("tab", { name: /Quota/ }));
    expect(within(dialog).getByText("$12 used · $3 in flight")).toBeInTheDocument();
  });

  test("filters by permission source", async () => {
    renderPage();
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by permission source" }));
    await userEvent.click(await screen.findByRole("option", { name: "Gold" }));
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).toBeNull();

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by permission source" }));
    await userEvent.click(await screen.findByRole("option", { name: "Individual" }));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  test("binds the selected accounts to a template in one request", async () => {
    renderPage();
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("checkbox", { name: "Select Alice" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Carol" }));
    expect(screen.getByText("2 accounts selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Bind template" }));
    const dialog = await screen.findByRole("dialog", { name: "Bind a permission template to 2 accounts" });
    expect(within(dialog).getByRole("radio", { name: /Gold/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Bind 2 accounts" }));

    await waitFor(() => expect(mocks.bindProfile).toHaveBeenCalledWith(["user-active", "user-carol"], "gold"));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("2 accounts selected")).toBeNull();
  });

  test("old backends get no selection column and keep legacy reset periods", async () => {
    mocks.list.mockResolvedValue({ items: users, capabilities: NO_ACCESS_POLICY_CAPABILITIES });
    renderPage();
    await screen.findByText("Alice");
    expect(screen.queryByRole("checkbox", { name: "Select Alice" })).toBeNull();
  });

  test("a window reset lists every limit it clears, totals and rules alike", async () => {
    renderPage();
    await screen.findByText("Bob");
    await openRowMoreActions("Bob");
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset account quota" }));

    const dialog = await screen.findByRole("dialog", { name: "Reset account quota" });
    expect(within(dialog).getByText("Spend $120 / $300")).toBeInTheDocument();
    expect(within(dialog).getByText("Requests 200 / 800 · Opus weekly: Requests 100 / 100")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reset Week quota" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset selected quotas" }));
    await waitFor(() => expect(mocks.resetPeriodSpending).toHaveBeenCalledWith("user-frozen", ["week"]));
  });

  test("an account with only a lifetime allowance can reach the reset action", async () => {
    renderPage();
    await screen.findByText("Carol");
    await openRowMoreActions("Carol");
    const action = screen.getByRole("menuitem", { name: "Reset account quota" });
    expect(action).not.toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Escape}");

    await openRowMoreActions("Alice");
    expect(
      screen.getByRole("menuitem", { name: "No resettable period quota; edit the account quota" }),
    ).toHaveAttribute("data-disabled");
  });

  test("reset history sits in the actions menu with its count", async () => {
    renderPage();
    await screen.findByText("Bob");
    await openRowMoreActions("Bob");
    await userEvent.click(screen.getByRole("menuitem", { name: "Reset history (2)" }));

    await waitFor(() => expect(mocks.listDailySpendingResetHistory).toHaveBeenCalledWith("user-frozen", 200));
    expect(await screen.findByText("Reset history · Bob / bob")).toBeInTheDocument();
    expect(screen.getByText("$175.50")).toBeInTheDocument();
  });

  test("account usage is filtered by the account id, without fetching key secrets", async () => {
    renderPage();
    await screen.findByText("Alice");
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: "View usage" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenCalledWith(expect.objectContaining({ end_user_id: "user-active", api_keys: [] })),
    );
  });

  test("saving the editor patches only what changed and refreshes the list", async () => {
    renderPage();
    await screen.findByText("Alice");
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: "Edit user account" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit user account" });

    await userEvent.click(within(dialog).getByRole("tab", { name: /Rate limits/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Requests per minute (RPM)" }), "60");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("user-active", { "rpm-limit": 60 }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit user account" })).toBeNull());
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  test("a rejected save keeps the editor open with the reason", async () => {
    mocks.update.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    await screen.findByText("Alice");
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: "Edit user account" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit user account" });
    await userEvent.click(within(dialog).getByRole("tab", { name: /Rate limits/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Requests per minute (RPM)" }), "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("boom");
  });

  test("searches and paginates client-side", async () => {
    const many = Array.from({ length: 25 }, (_, index) => {
      const suffix = String(index + 1).padStart(2, "0");
      return normalizeEndUser({
        ...base,
        id: `end-user-${suffix}`,
        username: `user-${suffix}`,
        display_name: `User ${suffix}`,
        status: (index + 1) % 5 === 0 ? "locked" : "active",
      });
    });
    mocks.list.mockResolvedValue({ items: many, capabilities: FULL });
    renderPage();

    expect(await screen.findByText("User 01")).toBeInTheDocument();
    expect(screen.queryByText("User 21")).toBeNull();
    expect(screen.getByText("1-20 of 25")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await userEvent.click(screen.getByRole("option", { name: "Frozen" }));
    expect(await screen.findByText("User 05")).toBeInTheDocument();
    expect(screen.getByText("1-5 of 5")).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Search user accounts" }), "missing");
    expect(await screen.findByText("No user accounts match the filters")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("User 01")).toBeInTheDocument();
    expect(screen.getByText("1-20 of 25")).toBeInTheDocument();
  });

  describe("upstream freezes", () => {
    const frozenFor = (
      id: number,
      kind: "end_user" | "api_key",
      subjectId: string,
      extra: Partial<AccessFreeze> = {},
    ): AccessFreeze => ({
      id,
      subject: { tenant_id: "tenant-1", kind, id: subjectId },
      subject_name: "",
      provider: "codex",
      provider_name: "Codex",
      reason_code: "cyber_policy",
      upstream_message: "This content was flagged for possible cybersecurity risk.",
      model: "gpt-6.1-sol",
      strike_count: 2,
      frozen_at: "2026-11-13T02:00:00Z",
      notice: "frozen",
      ...extra,
    });
    const aliceFreeze = frozenFor(7, "end_user", "user-active");
    const keyFreeze = frozenFor(8, "api_key", "key-1");

    beforeEach(() => {
      mocks.list.mockResolvedValue({ items: users, capabilities: { ...FULL, accessFreezes: true } });
      // What the backend does with the filter: asked for one requester, only that one's freezes.
      mocks.freezes.mockImplementation(async (query: { subjectId?: string }) =>
        [aliceFreeze, keyFreeze].filter((item) => !query.subjectId || item.subject.id === query.subjectId),
      );
    });

    test("tags the account an upstream froze next to its own status, and counts every freeze in effect", async () => {
      renderPage();
      await screen.findByText("Alice");

      const alice = rowOf("Alice");
      expect(await within(alice).findByRole("button", { name: "Codex frozen" })).toBeInTheDocument();
      // The account's own status is untouched: this freeze is one upstream's, not the account's.
      expect(within(alice).getByText("Active")).toBeInTheDocument();
      expect(within(rowOf("Carol")).queryByRole("button", { name: /frozen/i })).toBeNull();
      // Bob's own status reads "Frozen" too, and is a status, not a freeze of an upstream.
      expect(within(rowOf("Bob")).getByText("Frozen")).toBeInTheDocument();
      expect(within(rowOf("Bob")).queryByRole("button", { name: /frozen/i })).toBeNull();

      // The key no portal account owns counts as well: the toolbar button says how many are in effect.
      const toolbar = await screen.findByRole("button", { name: /Upstream freezes/ });
      expect(toolbar).toHaveTextContent("2");
      expect(mocks.freezes).toHaveBeenCalledWith({ status: "active", limit: 1000 });
    });

    test("opens the account's freezes from its tag, asking for that account's whole history", async () => {
      renderPage();
      await screen.findByText("Alice");
      await userEvent.click(await within(rowOf("Alice")).findByRole("button", { name: "Codex frozen" }));

      const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
      await waitFor(() =>
        expect(mocks.freezes).toHaveBeenCalledWith({
          status: "all",
          subjectKind: "end_user",
          subjectId: "user-active",
          limit: 200,
        }),
      );
      expect(mocks.freezeStrikes).toHaveBeenCalledWith({
        subjectKind: "end_user",
        subjectId: "user-active",
        limit: 200,
      });
      expect(await within(dialog).findByRole("button", { name: "Release" })).toBeInTheDocument();
    });

    test("the actions menu reaches the same freezes, with the count that is in effect", async () => {
      renderPage();
      await screen.findByText("Alice");
      await within(rowOf("Alice")).findByRole("button", { name: "Codex frozen" });

      await openRowMoreActions("Alice");
      await userEvent.click(screen.getByRole("menuitem", { name: "Upstream freezes (1)" }));
      expect(await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" })).toBeInTheDocument();
    });

    test("an account with no freeze in effect can still be looked up for its history", async () => {
      renderPage();
      await screen.findByText("Carol");
      await within(rowOf("Alice")).findByRole("button", { name: "Codex frozen" });

      await openRowMoreActions("Carol");
      expect(screen.getByRole("menuitem", { name: "Upstream freezes" })).toBeInTheDocument();
    });

    test("the overview lists them all, the key included, and the threshold next to them", async () => {
      renderPage();
      await screen.findByText("Alice");
      await userEvent.click(await screen.findByRole("button", { name: /Upstream freezes/ }));

      const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
      const rows = within(within(dialog).getByRole("table")).getAllByRole("row");
      expect(rows).toHaveLength(3);
      expect(rows[1]).toHaveTextContent("Alice / alice");
      expect(rows[2]).toHaveTextContent("API key");
      expect(rows[2]).toHaveTextContent("Key key-1");
    });

    test("asks nothing and shows nothing on a backend that does not declare freezes", async () => {
      mocks.list.mockResolvedValue({ items: users, capabilities: FULL });
      renderPage();
      await screen.findByText("Alice");

      expect(mocks.freezes).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Upstream freezes/ })).toBeNull();
      expect(screen.queryByRole("button", { name: /Codex frozen/ })).toBeNull();
      await openRowMoreActions("Alice");
      expect(screen.queryByRole("menuitem", { name: /Upstream freezes/ })).toBeNull();
    });

    test("a reader without end_users.read is not shown, or asked for, any of it", async () => {
      denied.add("end_users.read");
      renderPage();
      await screen.findByText("Alice");

      expect(mocks.freezes).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /Upstream freezes/ })).toBeNull();
    });

    test("a backend with no database leaves the whole thing out", async () => {
      const { ApiClientError } = await import("@code-proxy/api-client");
      mocks.freezes.mockRejectedValue(
        new ApiClientError({
          message: "unavailable",
          status: 503,
          data: { error: { code: "access_freezes_unavailable", message: "unavailable" } },
        }),
      );
      renderPage();
      await screen.findByText("Alice");
      await waitFor(() => expect(mocks.freezes).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByRole("button", { name: /Upstream freezes/ })).toBeNull());
    });
  });
});
