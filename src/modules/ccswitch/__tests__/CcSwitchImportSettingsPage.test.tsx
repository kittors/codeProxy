import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { CcSwitchImportSettingsPage } from "@/modules/ccswitch/CcSwitchImportSettingsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import type { CcSwitchImportConfigListItem } from "@/modules/ccswitch/ccswitchImportConfigList";

const listChannelGroups = vi.fn();
const listAvailableModels = vi.fn();
const getModelConfigs = vi.fn();
const listConfigs = vi.fn();
const replaceConfigs = vi.fn();
const loadConfiguredModelAvailability = vi.fn();
const filterByConfiguredModelAvailability = vi.fn();

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

vi.mock("@/lib/http/apis/models", () => ({
  modelsApi: {
    listAvailableModels: (params: {
      allowedChannelGroups?: string[];
      allowedChannels?: string[];
    }) => listAvailableModels(params),
    getModelConfigs: (scope: "active" | "library") => getModelConfigs(scope),
  },
}));

vi.mock("@/modules/models/modelAvailability", () => ({
  loadConfiguredModelAvailability: () => loadConfiguredModelAvailability(),
  filterByConfiguredModelAvailability: <T extends { id: string }>(
    models: T[],
    availability: { scoped: boolean; idSet: Set<string> },
  ) => filterByConfiguredModelAvailability(models, availability),
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
    listAvailableModels.mockReset();
    getModelConfigs.mockReset();
    listConfigs.mockReset();
    replaceConfigs.mockReset();
    loadConfiguredModelAvailability.mockReset();
    filterByConfiguredModelAvailability.mockReset();
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: false,
      items: [],
      idSet: new Set<string>(),
    });
    filterByConfiguredModelAvailability.mockImplementation(
      <T extends { id: string }>(
        models: T[],
        availability: { scoped: boolean; idSet: Set<string> },
      ) =>
        availability.scoped
          ? models.filter((model) => availability.idSet.has(model.id.toLowerCase()))
          : models,
    );
    listChannelGroups.mockResolvedValue([
      { name: "pro", description: "Pro route", "path-routes": ["/pro"] },
      { name: "team-a", description: "Team A route", "path-routes": ["/team-a"] },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "deepseek-v4-flash" },
      { id: "kimi-k2" },
    ]);
    getModelConfigs.mockResolvedValue([]);
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

  test("creates a Codex config from a single channel group and model mapping table", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
        "allowed-models": ["deepseek-v4-flash", "kimi-k2"],
      },
      { name: "team-a", description: "Team A route", "path-routes": ["/team-a"] },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "deepseek-v4-flash" },
      { id: "gpt-4o-mini" },
      { id: "kimi-k2" },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    const origin = window.location.origin;

    expect(within(dialog).queryByLabelText(/codex endpoint path/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: /default model/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/for codex cli/i)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/select a channel group to load available models/i)).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue("gpt-5.5")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /pro.*\/pro/i }));

    expect(within(dialog).getByTestId("ccswitch-config-endpoint-preview")).toHaveTextContent(
      `${origin}/pro/v1`,
    );

    const requestModelInput = await within(dialog).findByLabelText(
      /cc switch request model for deepseek-v4-flash/i,
    );
    expect(listAvailableModels).not.toHaveBeenCalled();
    expect(
      within(dialog).queryByLabelText(/cc switch request model for gpt-4o-mini/i),
    ).not.toBeInTheDocument();
    await user.clear(requestModelInput);
    await user.type(requestModelInput, "gpt-5.5");

    await user.type(within(dialog).getByLabelText(/provider name/i), "Relay Codex");
    await user.type(within(dialog).getByLabelText(/remark/i), "Pro preset");

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          clientType: "codex",
          providerName: "Relay Codex",
          note: "Pro preset",
          defaultModel: "gpt-5.5",
          allowedChannelGroups: ["pro"],
          endpointPath: "/v1",
          modelMappings: expect.arrayContaining([
            {
              requestModel: "gpt-5.5",
              targetModel: "deepseek-v4-flash",
            },
          ]),
        }),
      ]),
    );

    expect(screen.getByText(/1 saved preset/i)).toBeInTheDocument();
  });

  test("uses the channel group allowed models as the authoritative model list", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "chatgpt-pro",
        description: "ChatGPT Pro route",
        "path-routes": ["/openai/pro"],
        "allowed-models": [
          "codex-auto-review",
          "gpt-5",
          "gpt-5.1",
          "gpt-5.2",
          "gpt-5.3-codex",
          "gpt-5.5",
        ],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "codex-auto-review" },
      { id: "gpt-5" },
      { id: "unexpected-extra-model" },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    const tabList = within(dialog).getByRole("tablist", { name: /type/i });
    const groupLabel = within(dialog).getByText(/select channel group/i);

    expect(
      groupLabel.compareDocumentPosition(tabList) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /chatgpt-pro.*\/openai\/pro/i }));

    const groupSelect = within(dialog).getByRole("combobox", { name: /select channel group/i });
    expect(groupSelect).toHaveTextContent("chatgpt-pro");
    expect(groupSelect).toHaveTextContent("/openai/pro");
    expect(within(dialog).queryByText(/path address/i)).not.toBeInTheDocument();

    expect(
      await within(dialog).findByLabelText(/cc switch request model for gpt-5\.5/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/cc switch request model for unexpected-extra-model/i),
    ).not.toBeInTheDocument();
    expect(listAvailableModels).not.toHaveBeenCalled();
  });

  test("filters fallback channel group models by configured model availability", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "chatgpt-pro",
        description: "ChatGPT Pro route",
        channels: ["A_GptPro"],
        channelDetails: [
          {
            name: "A_GptPro",
            source: "codex",
            default_tags: ["codex", "pro"],
            custom_tags: ["20x"],
            hidden_default_tags: [],
            display_tags: ["codex", "pro", "20x"],
          },
        ],
        "path-routes": ["/openai/pro"],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "codex-auto-review" },
      { id: "gpt-5" },
      { id: "gpt-5-codex" },
      { id: "gpt-5.1" },
      { id: "gpt-5.1-codex" },
      { id: "gpt-5.3-codex" },
      { id: "gpt-5.5" },
      { id: "gpt-image-2" },
    ]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [],
      idSet: new Set([
        "codex-auto-review",
        "gpt-5",
        "gpt-5-codex",
        "gpt-5.1",
        "gpt-5.1-codex",
        "gpt-5.3-codex",
        "gpt-5.5",
        "gpt-image-2",
      ]),
    });
    getModelConfigs.mockResolvedValue([
      { id: "gpt-5", owned_by: "openai" },
      { id: "gpt-5-codex", owned_by: "openai" },
      { id: "gpt-5.3-codex", owned_by: "codex" },
      { id: "gpt-5.5", owned_by: "codex" },
      { id: "gpt-image-2", owned_by: "openai" },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /chatgpt-pro.*\/openai\/pro/i }));

    expect(
      await within(dialog).findByLabelText(/cc switch request model for gpt-5\.5/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText(/cc switch request model for gpt-5-codex/i),
    ).not.toBeInTheDocument();
    expect(listAvailableModels).toHaveBeenCalledWith({
      allowedChannels: ["A_GptPro"],
    });
    expect(loadConfiguredModelAvailability).toHaveBeenCalledTimes(1);
    expect(getModelConfigs).toHaveBeenCalledWith("active");
  });

  test("uses the auth-file owner model group as the CC Switch actual model source", async () => {
    window.localStorage.setItem(
      "authFilesPage.modelOwnerGroupMap.v1",
      JSON.stringify({ kimi: "kimi-code" }),
    );
    listChannelGroups.mockResolvedValue([
      {
        name: "kimicode",
        description: "Kimi Code route",
        channels: ["kimi"],
        channelDetails: [
          {
            name: "kimi",
            source: "kimi",
            default_tags: ["kimi"],
            custom_tags: [],
            hidden_default_tags: [],
            display_tags: ["kimi"],
          },
        ],
        "path-routes": ["/kimicode"],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "kimi-k2" },
      { id: "kimi-k2-thinking" },
      { id: "kimi-k2.5" },
    ]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [],
      idSet: new Set(["kimi-k2.5", "kimi-k2.6"]),
    });
    getModelConfigs.mockResolvedValue([
      { id: "kimi-k2.5", owned_by: "kimi-code" },
      { id: "kimi-k2.6", owned_by: "kimi-code" },
      { id: "kimi-k2", owned_by: "moonshot" },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("tab", { name: /claude code/i }));
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /kimicode.*\/kimicode/i }));

    expect(await within(dialog).findAllByDisplayValue("kimi-k2.5")).toHaveLength(4);
    await user.click(within(dialog).getByRole("combobox", { name: /^main model$/i }));

    expect(await screen.findByRole("option", { name: "kimi-k2.6" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "kimi-k2" })).not.toBeInTheDocument();
    expect(listAvailableModels).not.toHaveBeenCalled();
    expect(getModelConfigs).toHaveBeenCalledWith("active");
  });

  test("preserves saved generic model mappings when reopening an edited config", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "kimicode",
        description: "Kimi Code route",
        "path-routes": ["/kimicode"],
        "allowed-models": ["kimi-k2.5"],
      },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-kimi",
        clientType: "codex",
        providerName: "Relay Kimi",
        note: "saved mapping",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["kimicode"],
        endpointPath: "/v1",
        usageAutoInterval: 30,
        modelMappings: [
          {
            requestModel: "gpt-5.5",
            targetModel: "moonshot-v1-128k",
          },
        ],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Relay Kimi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit config/i }));

    const dialog = await screen.findByRole("dialog", { name: /edit cc switch config/i });
    expect(
      await within(dialog).findByLabelText(/cc switch request model for kimi-k2\.5/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText(/cc switch request model for moonshot-v1-128k/i),
    ).toHaveValue("gpt-5.5");

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "cfg-kimi",
          defaultModel: "gpt-5.5",
          allowedChannelGroups: ["kimicode"],
          modelMappings: expect.arrayContaining([
            {
              requestModel: "gpt-5.5",
              targetModel: "moonshot-v1-128k",
            },
          ]),
        }),
      ]),
    );
  });

  test("previews the full BaseURL request address from the selected channel group path", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    const endpointPreview = within(dialog).getByTestId("ccswitch-config-endpoint-preview");
    const origin = window.location.origin;

    expect(endpointPreview).toHaveTextContent(`${origin}/v1`);

    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /team-a.*\/team-a/i }));

    expect(endpointPreview).toHaveTextContent(`${origin}/team-a/v1`);
  });

  test("creates a Claude Code config with main and family default models", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
        "allowed-models": ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("tab", { name: /claude code/i }));
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /pro.*\/pro/i }));

    expect(await within(dialog).findByText(/main model/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/haiku default model/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/sonnet default model/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/opus default model/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/cc switch request model/i)).toBeInTheDocument();

    const mainRequestModelInput = within(dialog).getByLabelText(/main model request model/i);
    await user.clear(mainRequestModelInput);
    await user.type(mainRequestModelInput, "claude-main-router");

    await user.type(within(dialog).getByLabelText(/provider name/i), "Relay Claude");
    await user.click(within(dialog).getByRole("combobox", { name: /claude code auth field/i }));
    await user.click(await screen.findByRole("option", { name: "ANTHROPIC_AUTH_TOKEN" }));
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          clientType: "claude",
          providerName: "Relay Claude",
          defaultModel: "claude-sonnet-4-5",
          allowedChannelGroups: ["pro"],
          apiKeyField: "ANTHROPIC_AUTH_TOKEN",
          modelMappings: expect.arrayContaining([
            {
              role: "main",
              requestModel: "claude-main-router",
              targetModel: "claude-sonnet-4-5",
            },
            {
              role: "haiku",
              requestModel: "claude-haiku-4-5",
              targetModel: "claude-haiku-4-5",
            },
            {
              role: "sonnet",
              requestModel: "claude-sonnet-4-5",
              targetModel: "claude-sonnet-4-5",
            },
            {
              role: "opus",
              requestModel: "claude-opus-4-1",
              targetModel: "claude-opus-4-1",
            },
          ]),
        }),
      ]),
    );
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
