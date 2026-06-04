import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import type { ChannelGroupChannelDetail } from "@/lib/http/apis/channel-groups";
import { DEFAULT_VISUAL_VALUES, type VisualConfigValues } from "@/modules/config/visual/types";
import {
  RoutingConfigEditor,
  type RoutingModelOption,
} from "@/modules/channel-groups/RoutingConfigEditor";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const toastMocks = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("goey-toast", () => ({
  GoeyToaster: () => null,
  goeyToast: {
    info: toastMocks.info,
    success: toastMocks.success,
    warning: toastMocks.warning,
    error: toastMocks.error,
  },
}));

function Harness({
  initialValues,
  loadModelsForChannels,
  availableChannels = ["Team A Claude", "Main Codex", "Backup Claude"],
  availableChannelDetails,
}: {
  initialValues?: VisualConfigValues;
  loadModelsForChannels?: (
    channels: string[],
    groupName?: string,
  ) => Promise<Array<string | RoutingModelOption>>;
  availableChannels?: string[];
  availableChannelDetails?: Record<string, ChannelGroupChannelDetail>;
}) {
  const [values, setValues] = useState<VisualConfigValues>({
    ...DEFAULT_VISUAL_VALUES,
    routingChannelGroups: [],
    routingPathRoutes: [],
    ...initialValues,
  });

  return (
    <ThemeProvider>
      <ToastProvider>
        <RoutingConfigEditor
          values={values}
          availableChannels={availableChannels}
          availableChannelDetails={availableChannelDetails}
          loadModelsForChannels={loadModelsForChannels}
          onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
        />
      </ToastProvider>
      <div data-testid="group-count">{values.routingChannelGroups.length}</div>
      <div data-testid="route-count">{values.routingPathRoutes.length}</div>
      <div data-testid="group-name">{values.routingChannelGroups[0]?.name ?? ""}</div>
      <div data-testid="group-strategy">{values.routingChannelGroups[0]?.strategy ?? ""}</div>
      <div data-testid="channel-name">
        {values.routingChannelGroups[0]?.channels[0]?.name ?? ""}
      </div>
      <div data-testid="channel-priority">
        {values.routingChannelGroups[0]?.channels[0]?.priority ?? ""}
      </div>
      <div data-testid="route-path">{values.routingPathRoutes[0]?.path ?? ""}</div>
      <div data-testid="allowed-models">
        {values.routingChannelGroups[0]?.allowedModels?.join(",") ?? ""}
      </div>
    </ThemeProvider>
  );
}

describe("RoutingConfigEditor", () => {
  beforeEach(() => {
    toastMocks.info.mockReset();
    toastMocks.success.mockReset();
    toastMocks.warning.mockReset();
    toastMocks.error.mockReset();
  });

  test("creates a group with searchable channel selection and priority", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-a");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-a");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    const priorityInput = screen.getByPlaceholderText("1");
    await user.type(priorityInput, "80");
    await user.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByTestId("group-count")).toHaveTextContent("1");
    expect(screen.getByTestId("group-name")).toHaveTextContent("team-a");
    expect(screen.getByTestId("channel-name")).toHaveTextContent("Team A Claude");
    expect(screen.getByTestId("channel-priority")).toHaveTextContent("80");
  });

  test("stores the group-scoped routing strategy from the editor modal", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "分组内调度策略" }));
    await user.click(screen.getByRole("option", { name: "优先首个可用渠道" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-fill-first");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-fill-first");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByTestId("group-strategy")).toHaveTextContent("fill-first");
  });

  test("shows fill-first as the table scheduling mode for that group", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <Harness
        initialValues={{
          ...DEFAULT_VISUAL_VALUES,
          routingChannelGroups: [
            {
              id: "group-kimicode",
              name: "kimicode",
              description: "",
              strategy: "fill-first",
              channels: [
                { id: "channel-main", name: "Main Codex", priority: "" },
                { id: "channel-backup", name: "Backup Claude", priority: "" },
              ],
              allowedModels: [],
            },
          ],
        }}
      />,
    );

    const row = screen.getByRole("row", { name: /kimicode/i });
    expect(row).toHaveTextContent("优先首个可用渠道");
  });

  test("defaults model tab selections to every channel-scoped model", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();
    const loadModelsForChannels = vi.fn(async (channels: string[]) =>
      channels.includes("Team A Claude") ? ["claude-sonnet-4-5", "claude-opus-4-5"] : [],
    );

    render(<Harness loadModelsForChannels={loadModelsForChannels} />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-models");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-models");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    await user.click(screen.getByRole("tab", { name: "模型列表" }));
    expect(await screen.findByLabelText("claude-sonnet-4-5")).toBeInTheDocument();
    expect(loadModelsForChannels).toHaveBeenCalledWith(["Team A Claude"]);

    // All models display as checked (no explicit restriction = all allowed)
    expect(screen.getByLabelText("claude-opus-4-5")).toBeChecked();
    expect(screen.getByLabelText("claude-sonnet-4-5")).toBeChecked();

    await user.click(screen.getByRole("button", { name: "添加" }));

    // Empty allowed-models means "no restriction" - no explicit list saved
    expect(screen.getByTestId("allowed-models")).not.toHaveTextContent(/claude/);
  });

  test("renders channel-scoped models as a checkbox table with descriptions and prices", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();
    const loadModelsForChannels = vi.fn(async () => [
      {
        id: "claude-sonnet-4-5",
        owned_by: "anthropic",
        description: "Fast Claude model",
        pricing: {
          mode: "token" as const,
          inputPricePerMillion: 3,
          outputPricePerMillion: 15,
          cachedPricePerMillion: 0.3,
          cacheReadPricePerMillion: 0,
          cacheWritePricePerMillion: 0,
          pricePerCall: 0,
        },
      },
    ]);

    render(<Harness loadModelsForChannels={loadModelsForChannels} />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    expect(await screen.findByRole("table", { name: "允许模型" })).toBeInTheDocument();
    expect(screen.getByLabelText("claude-sonnet-4-5")).toBeChecked();
    expect(screen.getByText("Fast Claude model")).toBeInTheDocument();
    expect(screen.getByText("$3 / $15 / $0.3")).toBeInTheDocument();
  });

  test("keeps modal body fixed while the basic tab content and model list own scrolling", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();
    const loadModelsForChannels = vi.fn(async () => [
      "claude-sonnet-4-5",
      "claude-opus-4-5",
      "gpt-5-codex",
    ]);

    render(<Harness loadModelsForChannels={loadModelsForChannels} />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    const modalBody = screen.getByTestId("group-editor-modal-body");
    expect(modalBody).toHaveClass("h-[560px]");
    expect(modalBody).toHaveClass("max-h-[calc(100vh-8rem)]");
    expect(modalBody).toHaveClass("overflow-hidden");
    expect(modalBody).toHaveClass("flex");
    expect(modalBody).toHaveClass("flex-col");

    const tabShell = screen.getByTestId("group-editor-tabs-shell");
    expect(tabShell).toHaveClass("flex");
    expect(tabShell).toHaveClass("flex-col");

    const tabViewport = screen.getByTestId("group-editor-tab-viewport");
    expect(tabViewport).toHaveClass("flex-1");
    expect(tabViewport).not.toHaveClass("overflow-hidden");
    expect(screen.getByText("分组内调度策略")).toBeInTheDocument();

    const basicScrollArea = screen.getByTestId("group-editor-basic-scroll-area");
    const basicScrollViewport = basicScrollArea.querySelector("[data-scroll-area-viewport]");
    const basicScrollContent = basicScrollArea.querySelector("[data-scroll-area-content]");
    expect(basicScrollArea).toHaveClass("-mr-5");
    expect(basicScrollViewport).not.toBeNull();
    expect(basicScrollContent).not.toBeNull();
    expect(basicScrollViewport!).toHaveClass("table-scrollbar");
    expect(basicScrollViewport!).toHaveAttribute("data-scrollbar-visibility", "always");
    expect(basicScrollContent!).toHaveClass("space-y-5", "pr-5");

    await user.click(screen.getByRole("tab", { name: "模型列表" }));
    expect(await screen.findByTestId("group-editor-model-list")).toHaveClass("-mx-5");
    expect(screen.getByTestId("group-editor-model-list-content")).toHaveClass("px-5");
    expect(screen.getByRole("table", { name: "允许模型" }).closest("[data-vt-scroll-content]")).not.toHaveClass(
      "pr-5",
    );
    expect(screen.getByRole("table", { name: "允许模型" })).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  test("renders the basic tab channel table without an internal table scroll container", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    const channelTable = screen.getByRole("table", { name: "选择渠道" });
    const tableShell = channelTable.closest("[data-vt-natural-flow]") as HTMLDivElement | null;

    expect(tableShell).not.toBeNull();
    expect(tableShell).toHaveClass("h-auto");
    expect(tableShell).toHaveClass("min-h-0");
    expect(tableShell).not.toHaveClass("h-[248px]");
    expect(tableShell!.querySelector(".table-scrollbar")).toBeNull();
    expect(tableShell!.querySelector("[data-vt-scrollbar]")).toBeNull();
  });

  test("keeps the model list table visible while channel models are loading", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();
    const loadModelsForChannels = vi.fn(
      () => new Promise<Array<string | RoutingModelOption>>(() => {}),
    );

    render(<Harness loadModelsForChannels={loadModelsForChannels} />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    expect(screen.getByTestId("group-editor-model-list")).toHaveClass("-mx-5");
    expect(screen.getByTestId("group-editor-model-list-content")).toHaveClass("px-5");
    expect(screen.getByRole("table", { name: "允许模型" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("加载中");
    expect(screen.getByRole("status")).toHaveClass("sr-only");
  });

  test("sets path routes directly inside group editor", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-a");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-a");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByTestId("route-count")).toHaveTextContent("1");
    expect(screen.getByTestId("route-path")).toHaveTextContent("/team-a");
  });

  test("normalizes a full access URL into the saved route path", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-url");
    await user.type(
      screen.getByPlaceholderText("/pro"),
      "https://relay.example.test/openai/team-url",
    );
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByTestId("route-count")).toHaveTextContent("1");
    expect(screen.getByTestId("route-path")).toHaveTextContent("/openai/team-url");
  });

  test("supports selecting and deselecting filtered channels from the dropdown header", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-b");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-b");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.type(screen.getByPlaceholderText("搜索渠道名称"), "Claude");
    await user.click(screen.getByRole("button", { name: /全选当前结果/ }));

    expect(screen.getAllByText("Team A Claude").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Backup Claude").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /取消全选当前结果/ }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(screen.getByText("还没有加入任何渠道。")).toBeInTheDocument();
  });

  test("requires a path before saving the group", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-c");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(screen.getByText("请填写路径。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });

  test("shows the system root route capabilities instead of model counts", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<Harness />);

    expect(screen.queryByText("模型数")).not.toBeInTheDocument();
    expect(screen.queryByText("可用能力")).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /系统默认/ })).toHaveTextContent("/");
    expect(screen.queryByText("系统内置，只读")).not.toBeInTheDocument();
    expect(screen.queryByText("models")).not.toBeInTheDocument();
    expect(screen.queryByText("chat")).not.toBeInTheDocument();
    expect(screen.queryByText("images")).not.toBeInTheDocument();
  });

  test("keeps the system root route in the table without a delete action", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<Harness />);

    const row = screen.getByRole("row", { name: /系统默认/ });
    expect(row).toHaveTextContent("/");
    expect(within(row).getByRole("button", { name: "编辑分组" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "删除分组" })).not.toBeInTheDocument();
  });

  test("updates model permissions for the system root route", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();
    const loadModelsForChannels = vi.fn(async (channels: string[], groupName?: string) =>
      channels.length === 0 && groupName === "default"
        ? ["gpt-root-allowed", "gpt-root-hidden"]
        : [],
    );

    render(<Harness loadModelsForChannels={loadModelsForChannels} />);

    const row = screen.getByRole("row", { name: /系统默认/ });
    await user.click(within(row).getByRole("button", { name: "编辑分组" }));

    expect(await screen.findByLabelText("gpt-root-allowed")).toBeChecked();
    await user.click(screen.getByLabelText("gpt-root-hidden"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(loadModelsForChannels).toHaveBeenCalledWith([], "default");
    expect(screen.getByTestId("allowed-models")).toHaveTextContent("gpt-root-allowed");
  });

  test("rejects the system root path for custom groups", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-root");
    await user.type(screen.getByPlaceholderText("/pro"), "/");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(screen.getByText("访问路径不能使用系统默认根路径 /。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });

  test("rejects invalid paths that contain empty segments", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-invalid");
    await user.type(screen.getByPlaceholderText("/pro"), "https://relay.example.test/openai//pro");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(
      screen.getByText("路径格式不正确，请填写域名后的路径，例如 /pro 或 /openai/pro。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });

  test("requires confirmation before deleting a channel group and its routes", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(
      <Harness
        initialValues={{
          ...DEFAULT_VISUAL_VALUES,
          routingChannelGroups: [
            {
              id: "group-team-a",
              name: "team-a",
              description: "Team A group",
              strategy: "round-robin",
              allowedModels: [],
              channels: [{ id: "channel-main-codex", name: "Main Codex", priority: "" }],
            },
          ],
          routingPathRoutes: [
            {
              id: "route-team-a",
              path: "/team-a",
              group: "team-a",
              stripPrefix: true,
              fallback: "none",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "删除分组" }));

    expect(screen.getByRole("dialog", { name: "删除渠道分组" })).toBeInTheDocument();
    expect(screen.getByText(/删除渠道分组 team-a/)).toBeInTheDocument();
    expect(screen.getByTestId("group-count")).toHaveTextContent("1");
    expect(screen.getByTestId("route-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByTestId("group-count")).toHaveTextContent("1");
    expect(screen.getByTestId("route-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "删除分组" }));
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(screen.getByTestId("group-count")).toHaveTextContent("0");
    expect(screen.getByTestId("route-count")).toHaveTextContent("0");
  });

  test("shows only invalid in the status column and opens a reason dialog for stale channels", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(
      <Harness
        initialValues={{
          ...DEFAULT_VISUAL_VALUES,
          routingChannelGroups: [
            {
              id: "group-stale",
              name: "legacy",
              description: "历史分组",
              strategy: "round-robin",
              allowedModels: [],
              channels: [
                { id: "channel-stale", name: "Legacy Claude", priority: "90" },
                { id: "channel-valid", name: "Main Codex", priority: "" },
              ],
            },
          ],
          routingPathRoutes: [
            {
              id: "route-stale",
              path: "/legacy",
              group: "legacy",
              stripPrefix: true,
              fallback: "none",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("异常")).toBeInTheDocument();
    expect(screen.queryByText("1 个已删除渠道")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /异常/ }));

    const dialog = screen.getByRole("dialog", { name: "分组异常原因" });
    expect(within(dialog).getByText("该分组包含已删除渠道")).toBeInTheDocument();
    expect(within(dialog).getByText("1 个已删除渠道")).toBeInTheDocument();
    expect(within(dialog).getByText("Legacy Claude")).toBeInTheDocument();
    expect(within(dialog).getByText("已删除")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "编辑分组" })).not.toBeInTheDocument();
    expect(toastMocks.warning).not.toHaveBeenCalled();
  });

  test("shows disabled auth-file channels as disabled instead of deleted", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(
      <Harness
        availableChannels={["Main Codex", "GptPlus8"]}
        availableChannelDetails={{
          "main codex": {
            name: "Main Codex",
            source: "codex",
            default_tags: [],
            custom_tags: [],
            hidden_default_tags: [],
            display_tags: ["codex"],
          },
          gptplus8: {
            name: "GptPlus8",
            source: "codex",
            disabled: true,
            default_tags: [],
            custom_tags: [],
            hidden_default_tags: [],
            display_tags: ["codex"],
          },
        }}
        initialValues={{
          ...DEFAULT_VISUAL_VALUES,
          routingChannelGroups: [
            {
              id: "group-mixed",
              name: "chatgpt-mix",
              description: "pro 和 plus 账号池的混合池",
              strategy: "round-robin",
              allowedModels: [],
              channels: [
                { id: "channel-deleted", name: "GptPlus6", priority: "20" },
                { id: "channel-disabled", name: "GptPlus8", priority: "" },
                { id: "channel-valid", name: "Main Codex", priority: "" },
              ],
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /异常/ }));

    const dialog = screen.getByRole("dialog", { name: "分组异常原因" });
    expect(within(dialog).getByText("1 个已删除渠道")).toBeInTheDocument();
    expect(within(dialog).getByText("GptPlus6")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "查看并清理" }));

    expect(screen.getAllByText("GptPlus8").length).toBeGreaterThan(0);
    const disabledRow = screen.getByRole("row", { name: /GptPlus8/ });
    expect(within(disabledRow).getByText("已禁用")).toBeInTheDocument();
    expect(within(disabledRow).queryByText("已删除")).not.toBeInTheDocument();
  });
});
