import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { CcSwitchImportSettingsPage } from "@/modules/ccswitch/CcSwitchImportSettingsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import type { CcSwitchImportConfigListItem } from "@/modules/ccswitch/ccswitchImportConfigList";

const listChannelGroups = vi.fn();
const listConfigs = vi.fn();
const replaceConfigs = vi.fn();

vi.mock("@/lib/http/apis/channel-groups", () => ({
  channelGroupsApi: {
    list: () => listChannelGroups(),
  },
}));

vi.mock("@/lib/http/apis/ccswitch-import-configs", () => ({
  ccSwitchImportConfigsApi: {
    list: () => listConfigs(),
    replace: (configs: CcSwitchImportConfigListItem[]) => replaceConfigs(configs),
  },
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <CcSwitchImportSettingsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("CcSwitchImportSettingsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    listChannelGroups.mockReset();
    listConfigs.mockReset();
    replaceConfigs.mockReset();
    listChannelGroups.mockResolvedValue([
      { name: "team-a", description: "Team A route" },
      { name: "team-b", description: "Team B route" },
    ]);
    listConfigs.mockResolvedValue([]);
    replaceConfigs.mockResolvedValue(undefined);
  });

  test("starts empty from the API even when legacy local storage exists", async () => {
    window.localStorage.setItem(
      "ccswitch.importSettings.v1",
      JSON.stringify({
        claude: {
          endpointPath: "",
          defaultModel: "claude-sonnet-4-5",
          usageAutoInterval: 30,
          apiKeyField: "ANTHROPIC_AUTH_TOKEN",
        },
        codex: {
          endpointPath: "/openai/v1",
          defaultModel: "gpt-5.6",
          usageAutoInterval: 45,
        },
        gemini: {
          endpointPath: "",
          defaultModel: "gemini-2.5-pro",
          usageAutoInterval: 30,
        },
      }),
    );

    renderPage();

    expect(await screen.findByText(/no cc switch configs yet/i)).toBeInTheDocument();
    expect(screen.queryByText("CliProxy Codex")).not.toBeInTheDocument();
    expect(listConfigs).toHaveBeenCalledTimes(1);
  });

  test("creates a new Claude Code config row and persists it through the API", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("tab", { name: /claude code/i }));
    await user.type(within(dialog).getByLabelText(/provider name/i), "Relay Claude");
    await user.type(within(dialog).getByLabelText(/remark/i), "Team preset");

    await user.click(within(dialog).getByRole("combobox", { name: /default model/i }));
    await user.click(await screen.findByRole("option", { name: "claude-sonnet-4-5" }));

    await user.click(within(dialog).getByRole("combobox", { name: /allowed channel groups/i }));
    await user.type(screen.getByPlaceholderText(/search channel groups/i), "team");
    await user.click(screen.getByRole("option", { name: /team-a/i }));

    await user.click(within(dialog).getByRole("combobox", { name: /claude code auth field/i }));
    await user.click(await screen.findByRole("option", { name: "ANTHROPIC_AUTH_TOKEN" }));

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          clientType: "claude",
          providerName: "Relay Claude",
          note: "Team preset",
          defaultModel: "claude-sonnet-4-5",
          allowedChannelGroups: ["team-a"],
          apiKeyField: "ANTHROPIC_AUTH_TOKEN",
        }),
      ]),
    );

    expect(screen.getByText(/1 saved preset/i)).toBeInTheDocument();
  });

  test("previews the full BaseURL request address while editing endpoint path", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    const endpointPreview = within(dialog).getByTestId("ccswitch-config-endpoint-preview");
    const origin = window.location.origin;

    expect(endpointPreview).toHaveTextContent(`${origin}/v1`);

    const endpointInput = within(dialog).getByLabelText(/codex endpoint path/i);
    await user.clear(endpointInput);
    await user.type(endpointInput, "/openai/v1");

    expect(endpointPreview).toHaveTextContent(`${origin}/openai/v1`);
  });

  test("deletes a saved config row through the API", async () => {
    listConfigs.mockResolvedValue([
      {
        id: "cfg-1",
        clientType: "codex",
        providerName: "Relay Codex",
        note: "Delete me",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["team-a"],
        endpointPath: "/v1",
        usageAutoInterval: 30,
      },
    ]);

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Relay Codex")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete config/i }));

    const dialog = await screen.findByRole("dialog", { name: /delete cc switch config/i });
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(replaceConfigs).toHaveBeenCalledWith([]));
  });
});
