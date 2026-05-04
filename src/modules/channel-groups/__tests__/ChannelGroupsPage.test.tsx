import { render, screen } from "@testing-library/react";
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
});
