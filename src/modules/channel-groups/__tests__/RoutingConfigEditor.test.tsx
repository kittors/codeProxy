import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import i18n from "@/i18n";
import {
  DEFAULT_VISUAL_VALUES,
  type VisualConfigValues,
} from "@/modules/config/visual/types";
import { RoutingConfigEditor } from "@/modules/channel-groups/RoutingConfigEditor";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

function Harness() {
  const [values, setValues] = useState<VisualConfigValues>({
    ...DEFAULT_VISUAL_VALUES,
    routingChannelGroups: [],
    routingPathRoutes: [],
  });

  return (
    <ThemeProvider>
      <RoutingConfigEditor
        values={values}
        availableChannels={["Team A Claude", "Main Codex", "Backup Claude"]}
        onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
      />
      <div data-testid="group-count">{values.routingChannelGroups.length}</div>
      <div data-testid="route-count">{values.routingPathRoutes.length}</div>
      <div data-testid="group-name">{values.routingChannelGroups[0]?.name ?? ""}</div>
      <div data-testid="channel-name">{values.routingChannelGroups[0]?.channels[0]?.name ?? ""}</div>
      <div data-testid="channel-priority">
        {values.routingChannelGroups[0]?.channels[0]?.priority ?? ""}
      </div>
      <div data-testid="route-path">{values.routingPathRoutes[0]?.path ?? ""}</div>
    </ThemeProvider>
  );
}

describe("RoutingConfigEditor", () => {
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
      "https://relay.07230805.xyz/openai/team-url",
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

  test("rejects invalid paths that contain empty segments", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-invalid");
    await user.type(screen.getByPlaceholderText("/pro"), "https://relay.07230805.xyz/openai//pro");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("option", { name: "Main Codex" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(screen.getByText("路径格式不正确，请填写域名后的路径，例如 /pro 或 /openai/pro。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
  });
});
