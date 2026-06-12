import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { CcSwitchImportSettingsPage } from "@pages/ccswitch-import-settings/CcSwitchImportSettingsPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import type { CcSwitchImportConfigListItem } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

const listChannelGroups = vi.fn();
const listAvailableModels = vi.fn();
const getModelConfigs = vi.fn();
const getAuthGroupModelOwnerMappingMap = vi.fn();
const listConfigs = vi.fn();
const replaceConfigs = vi.fn();
const loadConfiguredModelAvailability = vi.fn();
const filterByConfiguredModelAvailability = vi.fn();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: {
    list: () => listChannelGroups(),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/ccswitch-import-configs", () => ({
  ccSwitchImportConfigsApi: {
    list: () => listConfigs(),
    replace: (configs: CcSwitchImportConfigListItem[]) => replaceConfigs(configs),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/models", () => ({
  modelsApi: {
    listAvailableModels: (params: {
      allowedChannelGroups?: string[];
      allowedChannels?: string[];
    }) => listAvailableModels(params),
    getModelConfigs: (scope: "active" | "library") => getModelConfigs(scope),
    getAuthGroupModelOwnerMappingMap: () => getAuthGroupModelOwnerMappingMap(),
  },
}));

vi.mock("@features/model-availability", () => ({
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
    getAuthGroupModelOwnerMappingMap.mockReset();
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
    listAvailableModels.mockResolvedValue([{ id: "deepseek-v4-flash" }, { id: "kimi-k2" }]);
    getModelConfigs.mockResolvedValue([]);
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
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
    expect(
      within(dialog).queryByRole("combobox", { name: /default model/i }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/for codex cli/i)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/select a channel group to load available models/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByDisplayValue("gpt-5.5")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /pro.*\/pro/i }));

    expect(within(dialog).getByTestId("ccswitch-config-endpoint-preview")).toHaveTextContent(
      new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pro/cs_[a-z0-9]+/v1$`),
    );

    expect(await within(dialog).findByDisplayValue("deepseek-v4-flash")).toBeInTheDocument();
    expect(await within(dialog).findByDisplayValue("kimi-k2")).toBeInTheDocument();
    expect(listAvailableModels).not.toHaveBeenCalled();
    const requestModelInput = within(dialog).getByLabelText(
      /cc switch request model for mapping 1/i,
    );
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
          routePath: expect.stringMatching(/^\/pro\/cs_[a-z0-9]+$/),
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

  test("hides the Gemini CLI client from the CC Switch config modal", async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    expect(within(dialog).getByRole("tab", { name: /codex/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: /claude code/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole("tab", { name: /gemini cli/i })).not.toBeInTheDocument();
  });

  test("manually adds and deletes Codex model mappings while validating duplicate request models", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        description: "Pro route",
        "path-routes": ["/pro"],
        "allowed-models": ["deepseek-v4-flash", "kimi-k2"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(await screen.findByRole("option", { name: /pro.*\/pro/i }));

    // Auto-populated: row 1 = deepseek-v4-flash, row 2 = kimi-k2
    expect(await within(dialog).findByDisplayValue("deepseek-v4-flash")).toBeInTheDocument();
    expect(await within(dialog).findByDisplayValue("kimi-k2")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^save$/i })).toBeDisabled();

    // Row 1: change request model to gpt-5.5
    await user.clear(within(dialog).getByLabelText(/cc switch request model for mapping 1/i));
    await user.type(
      within(dialog).getByLabelText(/cc switch request model for mapping 1/i),
      "gpt-5.5",
    );

    // Row 2: change request model to gpt-5.5 (duplicate request model)
    await user.clear(within(dialog).getByLabelText(/cc switch request model for mapping 2/i));
    await user.type(
      within(dialog).getByLabelText(/cc switch request model for mapping 2/i),
      "gpt-5.5",
    );

    expect(
      await within(dialog).findByText(/cc switch request model cannot be repeated/i),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^save$/i })).toBeDisabled();

    // Delete mapping 2 — error should go away
    await user.click(within(dialog).getByRole("button", { name: /delete model mapping 2/i }));
    expect(
      within(dialog).queryByText(/cc switch request model cannot be repeated/i),
    ).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/provider name/i), "Relay Codex");
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          clientType: "codex",
          providerName: "Relay Codex",
          defaultModel: "gpt-5.5",
          modelMappings: [
            {
              requestModel: "gpt-5.5",
              targetModel: "deepseek-v4-flash",
            },
          ],
        }),
      ]),
    );
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

    expect(await within(dialog).findByDisplayValue("gpt-5.5")).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "unexpected-extra-model" }),
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

    expect(await within(dialog).findByDisplayValue("gpt-5.5")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("gpt-5-codex")).not.toBeInTheDocument();
    expect(listAvailableModels).toHaveBeenCalledWith({
      allowedChannelGroups: ["chatgpt-pro"],
    });
    expect(loadConfiguredModelAvailability).toHaveBeenCalledTimes(1);
    expect(getModelConfigs).toHaveBeenCalledWith("active");
  });

  test("merges mapped Codex owner models with OpenCode Go channel models in CC Switch presets", async () => {
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({ codex: "codex" });
    listChannelGroups.mockResolvedValue([
      {
        name: "opencodego+gpt",
        description: "OpenCode Go and GPT route",
        channels: ["A_GptPro", "opencode go"],
        channelDetails: [
          {
            name: "A_GptPro",
            source: "codex",
            default_tags: ["codex", "pro"],
            custom_tags: ["20x"],
            display_tags: ["codex", "pro", "20x"],
          },
          {
            name: "opencode go",
            source: "opencode-go",
            default_tags: ["opencode-go"],
            custom_tags: [],
            display_tags: ["opencode-go"],
          },
        ],
        "path-routes": ["/codexdeepseek"],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "gpt-5.5" },
      { id: "gpt-5.3-codex" },
      { id: "minimax-m2.7" },
      { id: "kimi-k2.6" },
    ]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [],
      idSet: new Set(["gpt-5.5", "gpt-5.3-codex", "minimax-m2.7", "kimi-k2.6"]),
    });
    getModelConfigs.mockResolvedValue([
      { id: "gpt-5.5", owned_by: "codex" },
      { id: "gpt-5.3-codex", owned_by: "codex" },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));
    await user.click(
      await screen.findByRole("option", { name: /opencodego\+gpt.*\/codexdeepseek/i }),
    );

    expect(await within(dialog).findByDisplayValue("gpt-5.5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("minimax-m2.7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("kimi-k2.6")).toBeInTheDocument();
    expect(listAvailableModels).toHaveBeenCalledWith({
      allowedChannelGroups: ["opencodego+gpt"],
    });
  });

  test("uses the auth-file owner model group as the CC Switch actual model source", async () => {
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({ kimi: "kimi-code" });
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
    expect(listAvailableModels).toHaveBeenCalledWith({
      allowedChannelGroups: ["kimicode"],
    });
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
      await within(dialog).findByRole("combobox", { name: /actual channel model 1/i }),
    ).toHaveTextContent("moonshot-v1-128k");
    expect(within(dialog).getByLabelText(/cc switch request model for mapping 1/i)).toHaveValue(
      "gpt-5.5",
    );

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

  test("shows saved model mappings immediately while edited config models refresh", async () => {
    const modelsDeferred = createDeferred<{ id: string }[]>();
    listChannelGroups.mockResolvedValue([
      {
        name: "kimicode",
        description: "Kimi Code route",
        "path-routes": ["/kimicode"],
      },
    ]);
    listAvailableModels.mockReturnValue(modelsDeferred.promise);
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

    expect(within(dialog).queryByTestId("ccswitch-model-mapping-loading")).toBeNull();
    expect(
      within(dialog).queryByText(/no models are available for this channel group/i),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/cc switch request model for mapping 1/i)).toHaveValue(
      "gpt-5.5",
    );
    expect(
      within(dialog).getByRole("combobox", { name: /actual channel model 1/i }),
    ).toHaveTextContent("moonshot-v1-128k");
    expect(within(dialog).getByRole("button", { name: /^save$/i })).not.toBeDisabled();

    modelsDeferred.resolve([{ id: "kimi-k2.5" }]);

    await waitFor(() =>
      expect(within(dialog).queryByTestId("ccswitch-model-mapping-loading")).toBeNull(),
    );
    expect(within(dialog).getByLabelText(/cc switch request model for mapping 1/i)).toHaveValue(
      "gpt-5.5",
    );
  });

  test("does not auto-expand saved generic mappings into identity rows after model refresh", async () => {
    const modelsDeferred = createDeferred<{ id: string }[]>();
    listChannelGroups.mockResolvedValue([
      {
        name: "deepseekv4flash+chatgpt",
        description: "DeepSeek v4 flash route",
        "path-routes": ["/deepseekv4flash-chatgpt"],
      },
    ]);
    listAvailableModels.mockReturnValue(modelsDeferred.promise);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-deepseek",
        clientType: "codex",
        providerName: "Relay DeepSeek",
        note: "saved mapping",
        defaultModel: "gpt-5.4",
        allowedChannelGroups: ["deepseekv4flash+chatgpt"],
        endpointPath: "/v1",
        usageAutoInterval: 30,
        modelMappings: [
          {
            requestModel: "gpt-5.4",
            targetModel: "deepseek-v4-flash",
          },
        ],
      },
    ]);

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Relay DeepSeek")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit config/i }));

    const dialog = await screen.findByRole("dialog", { name: /edit cc switch config/i });
    expect(within(dialog).getByLabelText(/cc switch request model for mapping 1/i)).toHaveValue(
      "gpt-5.4",
    );
    expect(
      within(dialog).getByRole("combobox", { name: /actual channel model 1/i }),
    ).toHaveTextContent("deepseek-v4-flash");

    modelsDeferred.resolve([
      { id: "gpt-5.5" },
      { id: "gpt-5.4" },
      { id: "deepseek-v4-flash" },
      { id: "deepseek-v4-pro" },
    ]);

    await waitFor(() =>
      expect(within(dialog).queryByTestId("ccswitch-model-mapping-loading")).toBeNull(),
    );

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "cfg-deepseek",
          defaultModel: "gpt-5.4",
          allowedChannelGroups: ["deepseekv4flash+chatgpt"],
          modelMappings: [
            {
              requestModel: "gpt-5.4",
              targetModel: "deepseek-v4-flash",
            },
          ],
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

    expect(endpointPreview).toHaveTextContent(
      new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/team-a/cs_[a-z0-9]+/v1$`),
    );
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
          routePath: expect.stringMatching(/^\/pro\/cs_[a-z0-9]+$/),
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

  test("filters out implicit channel groups except default from the CC Switch dropdown", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", description: "Pro route", "path-routes": ["/pro"] },
      { name: "default", implicit: true },
      { name: "nvidia", implicit: true },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /new config/i }));

    const dialog = await screen.findByRole("dialog", { name: /new cc switch config/i });
    await user.click(within(dialog).getByRole("combobox", { name: /select channel group/i }));

    const options = await screen.findAllByRole("option");
    const optionLabels = options.map((el) => el.textContent ?? "");

    expect(optionLabels.some((text) => text.includes("pro"))).toBe(true);
    expect(optionLabels.some((text) => text.includes("default"))).toBe(true);
    expect(optionLabels.some((text) => text.includes("nvidia"))).toBe(false);
  });

  test("shows hidden channel group label when editing a config with an implicit filtered-out group", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", description: "Pro route", "path-routes": ["/pro"] },
      { name: "default", implicit: true },
      { name: "nvidia", implicit: true },
    ]);
    listAvailableModels.mockResolvedValue([]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-nvidia",
        clientType: "codex",
        providerName: "Relay NVIDIA",
        note: "old config",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["nvidia"],
        endpointPath: "/v1",
        usageAutoInterval: 30,
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "mistral-7b" }],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Relay NVIDIA")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit config/i }));

    const dialog = await screen.findByRole("dialog", { name: /edit cc switch config/i });
    expect(
      await within(dialog).findByRole("combobox", { name: /select channel group/i }),
    ).toHaveTextContent(/nvidia/i);

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "cfg-nvidia",
          allowedChannelGroups: ["nvidia"],
        }),
      ]),
    );
  });
});
