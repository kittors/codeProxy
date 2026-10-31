import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import type {
  RoutingSimulationParams,
  RoutingSimulationResult,
} from "@code-proxy/api-client/endpoints/routing-simulation";
import { RoutingSimulatorDialog } from "../RoutingSimulatorDialog";

const mocks = vi.hoisted(() => ({
  listKeys: vi.fn<() => Promise<ApiKeyEntry[]>>(),
  listModels:
    vi.fn<
      (params: {
        allowedChannelGroups?: string[];
        allowedChannels?: string[];
      }) => Promise<{ id: string }[]>
    >(),
  run: vi.fn<(params: RoutingSimulationParams) => Promise<RoutingSimulationResult>>(),
}));

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeyEntriesApi: { list: mocks.listKeys },
}));
vi.mock("@code-proxy/api-client/endpoints/models", () => ({
  modelsApi: { listAvailableModels: mocks.listModels },
}));
vi.mock("@code-proxy/api-client/endpoints/routing-simulation", () => ({
  routingSimulationApi: { run: mocks.run },
}));

const KEYS: ApiKeyEntry[] = [
  { id: "key-team", key: "sk-team", name: "Team key", "allowed-channel-groups": ["team"] },
  {
    id: "key-limited",
    key: "sk-limited",
    name: "Limited key",
    "allowed-models": ["gpt-5", " gpt-5-mini "],
  },
  // 老数据里没有 id 的 Key 不能按 id 模拟，不出现在列表里。
  { key: "sk-legacy", name: "Legacy key" },
];

// 冷却倒计时按收到结果的时刻算，结束时间要相对真实的现在给：两分钟后。
const served = (): RoutingSimulationResult => ({
  "api-key": { id: "key-team", name: "Team key" },
  endpoint: "messages",
  "requested-model": "gpt-5",
  "route-path": "/team",
  stages: [
    { name: "auth", outcome: "passed" },
    { name: "route", outcome: "passed" },
    { name: "quota", outcome: "skipped" },
    { name: "handler", outcome: "passed" },
  ],
  route: { "route-path": "/team", group: "team", fallback: "default" },
  model: "gpt-5",
  selection: {
    model: "gpt-5",
    "model-key": "gpt-5",
    providers: ["codex"],
    groups: [
      {
        name: "team",
        distribution: "least-load",
        credentials: [
          {
            "auth-id": "auth-a",
            label: "Team A",
            provider: "codex",
            weight: 2,
            "in-flight": 1,
            "concurrency-limit": 4,
            "load-ratio": 0.25,
            score: 0.5,
            attempt: 1,
          },
          {
            "auth-id": "auth-b",
            label: "Team B",
            provider: "codex",
            weight: 1,
            "in-flight": 0,
            "load-ratio": 0,
            attempt: 2,
          },
          {
            "auth-id": "auth-c",
            label: "Team C",
            provider: "codex",
            weight: 1,
            "in-flight": 0,
            "load-ratio": 0,
            blocked: "cooldown",
            "blocked-until": new Date(Date.now() + 120_000).toISOString(),
            "block-cause": "rate_limited",
            "block-http-status": 429,
          },
          {
            "auth-id": "auth-d",
            label: "Team D",
            provider: "codex",
            weight: 1,
            "in-flight": 0,
            "load-ratio": 0,
            excluded: "model",
            "model-excluded-by": ["team", "pro"],
          },
          {
            "auth-id": "auth-e",
            provider: "codex",
            weight: 1,
            "in-flight": 0,
            "load-ratio": 0,
            excluded: "channel",
          },
        ],
      },
    ],
    attempts: [
      { "auth-id": "auth-a", group: "team", "upstream-model": "gpt-5-codex" },
      { "auth-id": "auth-b", group: "team" },
    ],
  },
});

function renderDialog(open = true) {
  const onClose = vi.fn();
  const view = render(
    <ThemeProvider>
      <RoutingSimulatorDialog
        open={open}
        pathRoutes={[
          { path: "/team", group: "team" },
          { path: " ", group: "ignored" },
        ]}
        onClose={onClose}
      />
    </ThemeProvider>,
  );
  return { ...view, onClose };
}

/** 刚打开的下拉列表：上一个列表的退场动画还没播完时也还在文档里，新的排在最后。 */
async function openList(user: ReturnType<typeof userEvent.setup>, field: string) {
  await user.click(screen.getByRole("combobox", { name: field }));
  return (await screen.findAllByRole("listbox", { name: field })).at(-1)!;
}

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
  const list = await openList(user, field);
  await user.click(within(list).getByRole("option", { name: option }));
}

describe("RoutingSimulatorDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.listKeys.mockReset();
    mocks.listModels.mockReset();
    mocks.run.mockReset();
    mocks.listKeys.mockResolvedValue(KEYS);
    mocks.listModels.mockResolvedValue([{ id: "gpt-5" }, { id: "claude-sonnet-4-5" }]);
  });

  test("asks for a key and a model before it runs", async () => {
    const user = userEvent.setup();
    renderDialog();
    const keyField = screen.getByRole("combobox", { name: "API key" });
    await waitFor(() => expect(keyField).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Simulate" }));
    expect(await screen.findByText("Select an API key.")).toBeInTheDocument();
    expect(screen.getByText("Enter a model.")).toBeInTheDocument();
    expect(mocks.run).not.toHaveBeenCalled();

    const keys = await openList(user, "API key");
    expect(
      within(keys)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Limited key", "Team key"]);
  });

  test("offers the key's own models when it is limited to some", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());
    await choose(user, "API key", "Limited key");

    const models = await openList(user, "Model");
    expect(
      within(models)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["gpt-5", "gpt-5-mini"]);
    expect(mocks.listModels).not.toHaveBeenCalled();
  });

  test("simulates the request and shows which account serves it and why the others do not", async () => {
    const user = userEvent.setup();
    mocks.run.mockImplementation(async () => served());
    renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());

    await choose(user, "API key", "Team key");
    await waitFor(() =>
      expect(mocks.listModels).toHaveBeenCalledWith({
        allowedChannelGroups: ["team"],
        allowedChannels: undefined,
      }),
    );
    await choose(user, "Model", "gpt-5");
    await choose(user, "Path route", "/team → team");
    await choose(user, "Request format", "Claude format (/v1/messages)");
    await user.click(screen.getByRole("button", { name: "Simulate" }));

    await waitFor(() =>
      expect(mocks.run).toHaveBeenCalledWith({
        apiKeyId: "key-team",
        model: "gpt-5",
        routePath: "/team",
        endpoint: "messages",
      }),
    );
    // 读屏只播报结论这一句，和结果的标题是同一句话。
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Served by Team A"));
    expect(screen.getAllByText("Served by Team A")).toHaveLength(2);
    expect(screen.getByText("Group: team · Model sent upstream: gpt-5-codex")).toBeInTheDocument();
    expect(screen.getByText("If it fails, 1 more account can take over")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Path /team → group team, falling back to default when it has no candidate account",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The quota check counts the request against the key/),
    ).toBeInTheDocument();

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(
      rows.map((row) => within(row).queryAllByRole("cell")[0]?.textContent ?? "header"),
    ).toEqual(["header", "Team Acodexauth-a", "Team Bcodexauth-b", "Team Ccodexauth-c"]);
    const [, first, second, cooling] = rows;
    expect(first).toHaveTextContent("First choice");
    expect(first).toHaveTextContent("1/4");
    expect(first).toHaveTextContent("25%");
    expect(first).toHaveTextContent("Score 0.50");
    expect(second).toHaveTextContent("Attempt 2");
    // 最少负载优先的分组里，得分为 0 时后端省略字段，照样显示 0。
    expect(second).toHaveTextContent("Score 0.00");
    expect(cooling).toHaveTextContent("Cooling down");
    expect(cooling).toHaveTextContent("Rate limited · HTTP 429");
    expect(cooling).toHaveTextContent("Recovers in about 2 minutes");

    expect(screen.getByText("2 accounts don't take part")).toBeInTheDocument();
    expect(screen.getByText("Excluded from this model by team and pro")).toBeInTheDocument();
    expect(screen.getByText("Not among the key's allowed channels")).toBeInTheDocument();

    // 改了条件还没重跑：结果留着，但标明是上一次的。
    expect(
      screen.queryByText("The inputs changed; the result below is from the last run"),
    ).toBeNull();
    await choose(user, "Model", "claude-sonnet-4-5");
    expect(
      screen.getByText("The inputs changed; the result below is from the last run"),
    ).toBeInTheDocument();
  });

  test("names the stage that would reject the request", async () => {
    const user = userEvent.setup();
    mocks.run.mockResolvedValue({
      "api-key": { id: "key-limited" },
      endpoint: "chat-completions",
      "requested-model": "gpt-4o",
      stages: [
        { name: "auth", outcome: "passed" },
        { name: "model-gate", outcome: "rejected" },
        { name: "handler", outcome: "not-run" },
      ],
      rejection: {
        stage: "model-gate",
        "http-status": 403,
        code: "model_not_allowed",
        message: "model gpt-4o is not allowed for this key",
      },
    });
    renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());
    await choose(user, "API key", "Limited key");
    const models = await openList(user, "Model");
    await user.type(within(models).getByPlaceholderText("Search or type a model name"), "gpt-4o");
    await user.click(within(models).getByRole("option", { name: "Use “gpt-4o”" }));
    await user.click(screen.getByRole("button", { name: "Simulate" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The request would be rejected at “Model restriction”",
      ),
    );
    expect(
      screen.getAllByText("The request would be rejected at “Model restriction”"),
    ).toHaveLength(2);
    expect(screen.getByText("HTTP 403 · model_not_allowed")).toBeInTheDocument();
    expect(screen.getByText("model gpt-4o is not allowed for this key")).toBeInTheDocument();
    const stages = screen.getByRole("list", { name: "Stages the request goes through" });
    expect(
      within(stages)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Key checkPassed", "Model restrictionRejected", "Account selectionNot reached"]);
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o" }));
  });

  test("says how long the request would wait when every account is busy", async () => {
    const user = userEvent.setup();
    mocks.run.mockResolvedValue({
      "api-key": { id: "key-team" },
      endpoint: "chat-completions",
      "requested-model": "gpt-5",
      stages: [{ name: "handler", outcome: "passed" }],
      selection: {
        model: "gpt-5",
        "model-key": "gpt-5",
        providers: ["codex", "openai"],
        groups: [],
        attempts: [],
        error: { "http-status": 429, code: "model_cooldown", "retry-after-ms": 41_000 },
        "retry-wait-ms": 40_000,
        "retry-wait-kind": "busy-wait",
      },
    });
    renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());
    await choose(user, "API key", "Team key");
    await choose(user, "Model", "gpt-5");
    await user.click(screen.getByRole("button", { name: "Simulate" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("No account can serve this request"),
    );
    expect(
      screen.getByText(
        "The group waits while every account is busy: the request would wait about 40 seconds for one to recover, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Retry in about 41 seconds")).toBeInTheDocument();
    expect(screen.getByText(/Providers: codex and openai/)).toBeInTheDocument();
  });

  test("shows a failed run and keeps the form", async () => {
    const user = userEvent.setup();
    mocks.run.mockRejectedValue(new Error("api_key_not_found"));
    renderDialog();
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());
    await choose(user, "API key", "Team key");
    await choose(user, "Model", "gpt-5");
    await user.click(screen.getByRole("button", { name: "Simulate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("api_key_not_found");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("combobox", { name: "API key" })).toHaveTextContent("Team key");
  });

  test("loads the keys again each time it opens", async () => {
    mocks.listKeys.mockRejectedValueOnce(new Error("boom"));
    const view = renderDialog();
    expect(await screen.findByText("Couldn't load API keys: boom")).toBeInTheDocument();

    view.rerender(
      <ThemeProvider>
        <RoutingSimulatorDialog open={false} pathRoutes={[]} onClose={view.onClose} />
      </ThemeProvider>,
    );
    view.rerender(
      <ThemeProvider>
        <RoutingSimulatorDialog open pathRoutes={[]} onClose={view.onClose} />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByRole("combobox", { name: "API key" })).toBeEnabled());
    expect(screen.queryByText("Couldn't load API keys: boom")).toBeNull();
    expect(mocks.listKeys).toHaveBeenCalledTimes(2);
  });
});
