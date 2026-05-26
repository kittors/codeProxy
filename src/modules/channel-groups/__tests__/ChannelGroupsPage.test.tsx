import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { apiClient } from "@/lib/http/client";
import { ChannelGroupsPage } from "@/modules/channel-groups/ChannelGroupsPage";
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

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedApiGet = vi.mocked(apiClient.get);
const mockedApiPut = vi.mocked(apiClient.put);

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ChannelGroupsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ChannelGroupsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.clear();
    toastMocks.info.mockReset();
    toastMocks.success.mockReset();
    toastMocks.warning.mockReset();
    toastMocks.error.mockReset();
    mockedApiGet.mockReset();
    mockedApiPut.mockReset();
    mockedApiPut.mockResolvedValue({ status: "ok" });
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [{ name: "Claude Pool", channels: ["Team A Claude"] }],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({
          data: [{ id: "claude-3-7-sonnet-latest" }, { id: "gpt-should-not-leak" }],
        });
      }
      if (path === "/auth-files") {
        return Promise.resolve({
          files: [{ name: "claude-account.json", type: "claude", disabled: false }],
        });
      }
      if (path === "/model-configs?scope=library") {
        return Promise.resolve({
          data: [
            {
              id: "claude-3-7-sonnet-latest",
              owned_by: "anthropic",
              description: "Mapped Claude model",
              pricing: {
                mode: "token",
                input_price_per_million: 3,
                output_price_per_million: 15,
                cached_price_per_million: 0.3,
              },
            },
            {
              id: "gpt-should-not-leak",
              owned_by: "openai",
              description: "Unmapped OpenAI model",
            },
          ],
        });
      }
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
  });

  test("filters group editor models by the auth-file model owner group mapping", async () => {
    window.localStorage.setItem(
      "authFilesPage.modelOwnerGroupMap.v1",
      JSON.stringify({ claude: "anthropic" }),
    );
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "team-claude");
    await user.type(screen.getByPlaceholderText("/pro"), "/team-claude");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(await screen.findByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    expect(await screen.findByRole("table", { name: "允许模型" })).toBeInTheDocument();
    expect(await screen.findByLabelText("claude-3-7-sonnet-latest")).toBeInTheDocument();
    expect(screen.getByText("Mapped Claude model")).toBeInTheDocument();
    expect(screen.getByText("$3 / $15 / $0.3")).toBeInTheDocument();
    expect(screen.queryByLabelText("gpt-should-not-leak")).not.toBeInTheDocument();
  });

  test("uses the configured auth-file model owner group as the authoritative model scope", async () => {
    window.localStorage.setItem(
      "authFilesPage.modelOwnerGroupMap.v1",
      JSON.stringify({ kimi: "kimi-code" }),
    );
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [
            {
              name: "Kimi Pool",
              channels: ["kimi"],
              "channel-details": [{ name: "kimi", source: "kimi", display_tags: ["kimi"] }],
            },
          ],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({
          data: [
            { id: "kimi-k2" },
            { id: "kimi-k2-thinking" },
            { id: "kimi-k2.5" },
            { id: "kimi-k2.6" },
          ],
        });
      }
      if (path === "/auth-files") {
        return Promise.resolve({
          files: [{ name: "kimi-account.json", type: "kimi", disabled: false }],
        });
      }
      if (path === "/auth-files/models") {
        return Promise.resolve({
          models: [
            { id: "kimi-k2", display_name: "Kimi K2", owned_by: "moonshot" },
            { id: "kimi-k2-thinking", display_name: "Kimi K2 Thinking", owned_by: "moonshot" },
            { id: "kimi-k2.5", display_name: "Kimi K2.5", owned_by: "moonshot" },
            { id: "kimi-k2.6", display_name: "Kimi K2.6", owned_by: "moonshot" },
          ],
        });
      }
      if (path === "/model-configs?scope=library") {
        return Promise.resolve({
          data: [
            {
              id: "kimi-k2.5",
              owned_by: "kimi-code",
              description: "Kimi K2.5",
            },
            {
              id: "kimi-k2.6",
              owned_by: "kimi-code",
              description: "Kimi K2.6",
            },
          ],
        });
      }
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "kimi");
    await user.type(screen.getByPlaceholderText("/pro"), "/kimi");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(await screen.findByRole("option", { name: "kimi" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    const table = await screen.findByRole("table", { name: "允许模型" });
    expect(await within(table).findByLabelText("kimi-k2.5")).toBeInTheDocument();
    expect(within(table).getByLabelText("kimi-k2.6")).toBeInTheDocument();
    expect(within(table).queryByLabelText("kimi-k2")).not.toBeInTheDocument();
    expect(within(table).queryByLabelText("kimi-k2-thinking")).not.toBeInTheDocument();
  });

  test("merges mapped owner models with OpenCode Go live models for mixed channel groups", async () => {
    window.localStorage.setItem(
      "authFilesPage.modelOwnerGroupMap.v1",
      JSON.stringify({ codex: "codex" }),
    );
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [
            {
              name: "opencodego+gpt",
              channels: ["A_GptPro", "opencode go"],
              "channel-details": [
                {
                  name: "A_GptPro",
                  source: "codex",
                  display_tags: ["codex", "pro", "20x"],
                },
                {
                  name: "opencode go",
                  source: "opencode-go",
                  display_tags: ["opencode-go"],
                },
              ],
            },
          ],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({
          data: [
            { id: "gpt-5.5" },
            { id: "gpt-5.3-codex" },
            { id: "minimax-m2.7" },
            { id: "kimi-k2.6" },
          ],
        });
      }
      if (path === "/auth-files") {
        return Promise.resolve({
          files: [{ name: "codex.json", type: "codex", disabled: false }],
        });
      }
      if (path === "/model-configs?scope=library") {
        return Promise.resolve({
          data: [
            { id: "gpt-5.5", owned_by: "codex", description: "GPT Pro" },
            { id: "gpt-5.3-codex", owned_by: "codex", description: "Codex" },
          ],
        });
      }
      if (path === "/opencode-go-api-key") {
        return Promise.resolve({
          "opencode-go-api-key": [{ name: "opencode go", "api-key": "sk-opencode-go" }],
        });
      }
      if (path === "/model-definitions/opencode-go") {
        return Promise.resolve({
          models: [
            { id: "minimax-m2.7", display_name: "MiniMax M2.7", owned_by: "opencode" },
            { id: "kimi-k2.6", display_name: "Kimi K2.6", owned_by: "opencode" },
          ],
        });
      }
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "opencodego+gpt");
    await user.type(screen.getByPlaceholderText("/pro"), "/codexdeepseek");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(await screen.findByRole("option", { name: /A_GptPro/ }));
    await user.click(await screen.findByRole("option", { name: /opencode go/ }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    const table = await screen.findByRole("table", { name: "允许模型" });
    expect(await within(table).findByLabelText("gpt-5.5")).toBeInTheDocument();
    expect(within(table).getByLabelText("gpt-5.3-codex")).toBeInTheDocument();
    expect(within(table).getByLabelText("minimax-m2.7")).toBeInTheDocument();
    expect(within(table).getByLabelText("kimi-k2.6")).toBeInTheDocument();
  });

  test("keeps live model owner metadata when no auth-file model owner group is configured", async () => {
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [
            {
              name: "Kimi Pool",
              channels: ["kimi"],
              "channel-details": [{ name: "kimi", source: "kimi", display_tags: ["kimi"] }],
            },
          ],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({
          data: [{ id: "kimi-k2" }],
        });
      }
      if (path === "/auth-files") {
        return Promise.resolve({
          files: [{ name: "kimi-account.json", type: "kimi", disabled: false }],
        });
      }
      if (path === "/auth-files/models") {
        return Promise.resolve({
          models: [{ id: "kimi-k2", display_name: "Kimi K2", owned_by: "moonshot" }],
        });
      }
      if (path === "/model-configs?scope=library") {
        return Promise.resolve({ data: [] });
      }
      if (
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "kimi");
    await user.type(screen.getByPlaceholderText("/pro"), "/kimi");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(await screen.findByRole("option", { name: "kimi" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("tab", { name: "模型列表" }));

    const table = await screen.findByRole("table", { name: "允许模型" });
    expect(await within(table).findByLabelText("kimi-k2")).toBeInTheDocument();
    expect(within(table).getByText("moonshot")).toBeInTheDocument();
  });

  test("shows channel tags in the selector options and selected rows", async () => {
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [
            {
              name: "Codex Pool",
              channels: ["A_GptPro"],
              "channel-details": [
                {
                  name: "A_GptPro",
                  source: "auth-file",
                  default_tags: ["codex", "pro"],
                  custom_tags: ["vip"],
                  hidden_default_tags: [],
                  display_tags: ["codex", "pro", "vip"],
                },
              ],
            },
          ],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({ data: [] });
      }
      if (
        path === "/auth-files" ||
        path === "/model-configs?scope=library" ||
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve({ files: [], data: [] });
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    const option = await screen.findByRole("option", { name: "A_GptPro" });
    expect(option).toHaveTextContent("codex");
    expect(option).toHaveTextContent("pro");
    expect(option).toHaveTextContent("vip");

    await user.click(option);

    const selectedChannelsTable = screen.getByRole("table", { name: "选择渠道" });
    const rowText = within(selectedChannelsTable).getByText("A_GptPro");
    const row = rowText.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLTableRowElement).getByText("codex")).toBeInTheDocument();
    expect(within(row as HTMLTableRowElement).getByText("pro")).toBeInTheDocument();
    expect(within(row as HTMLTableRowElement).getByText("vip")).toBeInTheDocument();
  });

  test("refreshes channel options when opening the new group editor", async () => {
    let channelGroupsCalls = 0;
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        channelGroupsCalls += 1;
        return Promise.resolve({
          items:
            channelGroupsCalls === 1 ? [] : [{ name: "Claude Pool", channels: ["Fresh Claude"] }],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({ data: [] });
      }
      if (
        path === "/auth-files" ||
        path === "/model-configs?scope=library" ||
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve({ files: [], data: [] });
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));

    expect(await screen.findByRole("option", { name: "Fresh Claude" })).toBeInTheDocument();
    expect(channelGroupsCalls).toBeGreaterThanOrEqual(2);
  });

  test("saves tag-match strategy and previews channels matching any selected tag", async () => {
    mockedApiGet.mockImplementation((path: string) => {
      if (path === "/routing-config") {
        return Promise.resolve({
          strategy: "round-robin",
          "include-default-group": true,
          "channel-groups": [],
          "path-routes": [],
        });
      }
      if (path === "/channel-groups") {
        return Promise.resolve({
          items: [
            {
              name: "default",
              channels: ["Team A Codex", "Pro Codex", "Free Codex"],
              "channel-details": [
                {
                  name: "Team A Codex",
                  source: "codex",
                  display_tags: ["codex", "team-a"],
                },
                {
                  name: "Pro Codex",
                  source: "codex",
                  display_tags: ["codex", "pro"],
                },
                {
                  name: "Free Codex",
                  source: "codex",
                  display_tags: ["codex", "free"],
                },
              ],
            },
          ],
        });
      }
      if (path.startsWith("/models?")) {
        return Promise.resolve({ data: [] });
      }
      if (
        path === "/auth-files" ||
        path === "/model-configs?scope=library" ||
        path === "/gemini-api-key" ||
        path === "/claude-api-key" ||
        path === "/codex-api-key" ||
        path === "/opencode-go-api-key" ||
        path === "/vertex-api-key" ||
        path === "/openai-compatibility"
      ) {
        return Promise.resolve({ files: [], data: [] });
      }
      return Promise.resolve({});
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.type(screen.getByPlaceholderText("pro"), "tag-pool");
    await user.type(screen.getByPlaceholderText("/pro"), "/tag-pool");
    await user.click(screen.getByRole("combobox", { name: "匹配策略" }));
    await user.click(await screen.findByRole("option", { name: "标签匹配" }));
    await user.click(screen.getByRole("combobox", { name: "选择标签" }));
    await user.click(await screen.findByRole("option", { name: "team-a" }));
    await user.click(await screen.findByRole("option", { name: "pro" }));
    await user.click(screen.getByRole("combobox", { name: "选择标签" }));

    const matchedChannelsTable = screen.getByRole("table", { name: "匹配渠道" });
    expect(within(matchedChannelsTable).getByText("Team A Codex")).toBeInTheDocument();
    expect(within(matchedChannelsTable).getByText("Pro Codex")).toBeInTheDocument();
    expect(within(matchedChannelsTable).queryByText("Free Codex")).not.toBeInTheDocument();
    expect(
      within(matchedChannelsTable).queryByRole("columnheader", { name: "操作" }),
    ).not.toBeInTheDocument();
    expect(within(matchedChannelsTable).queryByText("标签匹配")).not.toBeInTheDocument();

    const teamCodexRow = within(matchedChannelsTable).getByRole("row", { name: /Team A Codex/ });
    const priorityInput = within(teamCodexRow).getByPlaceholderText("1");
    await user.type(priorityInput, "80");

    await user.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled());
    expect(mockedApiPut).toHaveBeenCalledWith(
      "/routing-config",
      expect.objectContaining({
        "channel-groups": [
          expect.objectContaining({
            name: "tag-pool",
            match: { tags: ["team-a", "pro"] },
            "channel-priorities": {
              "Team A Codex": 80,
            },
          }),
        ],
      }),
    );
  });

  test("saves the default-route isolation flag for a channel group", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "新增分组" }));
    await user.click(screen.getByRole("checkbox", { name: "从系统默认路径隔离" }));
    await user.type(screen.getByPlaceholderText("pro"), "kimi-code");
    await user.type(screen.getByPlaceholderText("/pro"), "/kimicode");
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(await screen.findByRole("option", { name: "Team A Claude" }));
    await user.click(screen.getByRole("combobox", { name: "选择渠道" }));
    await user.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(mockedApiPut).toHaveBeenCalled());
    expect(mockedApiPut).toHaveBeenCalledWith(
      "/routing-config",
      expect.objectContaining({
        "channel-groups": [
          expect.objectContaining({
            name: "kimi-code",
            "exclude-from-default": true,
          }),
        ],
      }),
    );
  });
});
