import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { CcSwitchImportSettingsPage } from "@pages/ccswitch-import-settings/CcSwitchImportSettingsPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import {
  normalizeCcSwitchImportConfigList,
  type CcSwitchImportConfigListItem,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

const listChannelGroups = vi.fn();
const listAvailableModels = vi.fn();
const getModelConfigs = vi.fn();
const getAuthGroupModelOwnerMappingMap = vi.fn();
const listConfigs = vi.fn<() => Promise<Array<Partial<CcSwitchImportConfigListItem>>>>();
const listClientTypes = vi.fn<() => string[] | null>();
const listCapabilities = vi.fn<() => { codexContextWindow: boolean }>();
const replaceConfigs = vi.fn();
const loadConfiguredModelAvailability = vi.fn();
const filterByConfiguredModelAvailability = vi.fn();

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: {
    list: () => listChannelGroups(),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/ccswitch-import-configs", () => ({
  NO_CC_SWITCH_IMPORT_CAPABILITIES: { codexContextWindow: false },
  ccSwitchImportConfigsApi: {
    // Like the real endpoint, presets arrive normalized.
    snapshot: async () => ({
      configs: normalizeCcSwitchImportConfigList(await listConfigs()),
      clientTypes: listClientTypes(),
      capabilities: listCapabilities(),
    }),
    replace: (
      configs: CcSwitchImportConfigListItem[],
      capabilities?: { codexContextWindow: boolean },
    ) => replaceConfigs(configs, capabilities),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/models", () => ({
  modelsApi: {
    listAvailableModels: (params: {
      allowedChannelGroups?: string[];
      allowedChannels?: string[];
    }) => listAvailableModels(params),
    getModelConfigs: (scope: "active" | "library" | "all") => getModelConfigs(scope),
    getAuthGroupModelOwnerMappingMap: () => getAuthGroupModelOwnerMappingMap(),
  },
}));

vi.mock("@features/model-availability", () => ({
  loadConfiguredModelAvailability: (options?: { allowedChannelGroups?: string[] }) =>
    loadConfiguredModelAvailability(options),
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

async function openCreate(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: /new config/i }));
  return screen.findByRole("dialog", { name: /new cc switch config/i });
}

async function openEdit(user: UserEvent, name: string) {
  expect(await screen.findByText(name)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /edit config/i }));
  return screen.findByRole("dialog", { name: /edit cc switch config/i });
}

async function pickOption(user: UserEvent, combobox: HTMLElement, name: string | RegExp) {
  await user.click(combobox);
  await user.click(await screen.findByRole("option", { name }));
}

async function pickGroup(user: UserEvent, dialog: HTMLElement, name: RegExp) {
  await pickOption(user, within(dialog).getByRole("combobox", { name: /^channel group$/i }), name);
}

/**
 * Opens a picker, reads its option names and closes it again. A listbox that is still
 * animating out stays in the DOM for a moment; the one just opened is the last one.
 */
async function optionNames(user: UserEvent, combobox: HTMLElement) {
  await user.click(combobox);
  const listbox = (await screen.findAllByRole("listbox")).at(-1)!;
  const names = within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
  await user.keyboard("{Escape}");
  return names;
}

const nameInput = (dialog: HTMLElement) => within(dialog).getByRole("textbox", { name: /^name$/i });

const defaultModelPicker = (dialog: HTMLElement) =>
  within(dialog).getByRole("combobox", { name: /^default model$/i });

const savedConfig = () =>
  (replaceConfigs.mock.calls.at(-1)?.[0] as CcSwitchImportConfigListItem[] | undefined)?.[0];

describe("CcSwitchImportSettingsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    for (const mock of [
      listChannelGroups,
      listAvailableModels,
      getModelConfigs,
      getAuthGroupModelOwnerMappingMap,
      listConfigs,
      listClientTypes,
      listCapabilities,
      replaceConfigs,
      loadConfiguredModelAvailability,
      filterByConfiguredModelAvailability,
    ]) {
      mock.mockReset();
    }
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
    getModelConfigs.mockResolvedValue(Array<unknown>());
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
    listConfigs.mockResolvedValue([]);
    listClientTypes.mockReturnValue(null);
    listCapabilities.mockReturnValue({ codexContextWindow: false });
    replaceConfigs.mockResolvedValue(undefined);
  });

  test("starts empty from the API", async () => {
    renderPage();
    expect(await screen.findByText(/no cc switch configs yet/i)).toBeInTheDocument();
    expect(listConfigs).toHaveBeenCalledTimes(1);
  });

  test("offers only claude, codex and gemini when the backend does not report client-types", async () => {
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    const tabs = within(dialog)
      .getAllByRole("tab")
      .map((tab) => tab.textContent);
    expect(tabs).toEqual(["Claude Code", "Codex", "Gemini CLI"]);
    expect(within(dialog).getByRole("tab", { name: "Codex" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("offers OpenCode, OpenClaw and Hermes when the backend lists them", async () => {
    listClientTypes.mockReturnValue([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "openclaw",
      "hermes",
    ]);
    listChannelGroups.mockResolvedValue([
      { name: "pro", "path-routes": ["/pro"], "allowed-models": ["kimi-k2", "qwen3.5-plus"] },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    expect(
      within(dialog)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Claude Code", "Codex", "Gemini CLI", "OpenCode", "OpenClaw", "Hermes"]);
    await user.click(within(dialog).getByRole("tab", { name: "OpenCode" }));
    expect(nameInput(dialog)).toHaveValue("CliProxy OpenCode");
    await pickGroup(user, dialog, /pro.*\/pro/i);
    await pickOption(user, defaultModelPicker(dialog), "kimi-k2");

    const preview = within(dialog).getByTestId("ccswitch-import-preview");
    expect(preview).toHaveTextContent("~/.config/opencode/opencode.json");
    expect(within(dialog).getByTestId("ccswitch-config-endpoint-preview").textContent).toMatch(
      /\/pro\/cs_[a-z0-9]+\/v1$/,
    );

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        clientType: "opencode",
        providerName: "CliProxy OpenCode",
        defaultModel: "kimi-k2",
        endpointPath: "/v1",
        allowedChannelGroups: ["pro"],
        modelMappings: [
          { requestModel: "kimi-k2", targetModel: "kimi-k2" },
          { requestModel: "qwen3.5-plus", targetModel: "qwen3.5-plus" },
        ],
      }),
    );
  });

  test("creates a Codex preset: all group models on the route, a default and its context window", async () => {
    listCapabilities.mockReturnValue({ codexContextWindow: true });
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
    const dialog = await openCreate(user);

    expect(defaultModelPicker(dialog)).toBeDisabled();
    expect(
      within(dialog).getByText(/select a channel group to load its models/i),
    ).toBeInTheDocument();
    // No group, no route: the preview waits instead of showing a wrong endpoint.
    expect(within(dialog).getByTestId("ccswitch-import-preview-pending")).toBeInTheDocument();
    expect(within(dialog).queryByTestId("ccswitch-import-preview")).not.toBeInTheDocument();
    const routeModels = within(dialog).getByRole("combobox", { name: /^featured models/i });
    // Nothing to tick yet, but the route will start with every model: say that, not "select".
    expect(routeModels).toHaveTextContent(/^all models \(default\)$/i);

    await pickGroup(user, dialog, /pro.*\/pro/i);
    expect(listAvailableModels).not.toHaveBeenCalled();
    // Every model the group serves is on the route, and the picker says so.
    expect(routeModels).toHaveTextContent(/^all 2 models \(default\)$/i);
    expect(await optionNames(user, defaultModelPicker(dialog))).toEqual([
      "deepseek-v4-flash",
      "kimi-k2",
    ]);
    await pickOption(user, defaultModelPicker(dialog), "kimi-k2");

    await user.type(within(dialog).getByRole("spinbutton", { name: /^context window/i }), "200000");
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), "Relay Codex");
    await user.type(within(dialog).getByRole("textbox", { name: /^remark/i }), "Pro preset");

    const preview = within(dialog).getByTestId("ccswitch-import-preview");
    expect(preview).toHaveTextContent("~/.codex/config.toml");
    // CC Switch writes the key into the provider table and leaves auth.json to ChatGPT.
    expect(preview).toHaveTextContent('experimental_bearer_token = "sk-••••••••"');
    expect(preview).toHaveTextContent("requires_openai_auth = false");
    expect(preview).not.toHaveTextContent("auth.json");
    expect(preview).toHaveTextContent('model = "kimi-k2"');
    expect(preview).toHaveTextContent("model_context_window = 200000");
    expect(preview).not.toHaveTextContent("model_catalog_json");

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(replaceConfigs).toHaveBeenCalled());
    const saved = savedConfig()!;
    expect(saved).toMatchObject({
      clientType: "codex",
      providerName: "Relay Codex",
      note: "Pro preset",
      defaultModel: "kimi-k2",
      allowedChannelGroups: ["pro"],
      endpointPath: "/v1",
      codexContextWindow: 200000,
      modelMappings: [
        { requestModel: "deepseek-v4-flash", targetModel: "deepseek-v4-flash" },
        { requestModel: "kimi-k2", targetModel: "kimi-k2" },
      ],
    });
    // The capability travels with the save, so the field is sent to this backend.
    expect(replaceConfigs.mock.calls.at(-1)?.[1]).toEqual({ codexContextWindow: true });
    expect(saved.routePath).toMatch(/^\/pro\/cs_[a-z0-9]+$/);
    expect(saved).not.toHaveProperty("codexModelCatalog");
    expect(saved).not.toHaveProperty("apiKeyField");
    expect(await screen.findByText(/1 saved CC Switch config preset/i)).toBeInTheDocument();
  });

  test("blocks saving until a group, a name and a model are set", async () => {
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    await user.clear(nameInput(dialog));
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));

    expect(await within(dialog).findAllByText(/required/i)).toHaveLength(3);
    expect(replaceConfigs).not.toHaveBeenCalled();
  });

  test("creates a Claude Code preset whose tiers follow the main model until set", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        "path-routes": ["/pro"],
        "allowed-models": ["claude-haiku-4-5", "claude-opus-4-8", "claude-sonnet-5"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole("tab", { name: "Claude Code" }));
    await pickGroup(user, dialog, /pro.*\/pro/i);

    // The main model is suggested (Sonnet first); every tier still follows it.
    await waitFor(() =>
      expect(within(dialog).getByRole("combobox", { name: /^main model$/i })).toHaveTextContent(
        "claude-sonnet-5",
      ),
    );
    for (const tier of ["haiku", "sonnet", "opus", "fable"]) {
      expect(
        within(dialog).getByRole("combobox", { name: new RegExp(`^${tier} default model`, "i") }),
      ).toHaveTextContent(/same as main model/i);
    }
    const tierPicker = within(dialog).getByRole("combobox", { name: /^fable default model/i });
    // No request-name column any more, and no auth-field choice.
    expect(within(dialog).queryByText(/request model/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/auth field/i)).not.toBeInTheDocument();

    await pickOption(user, tierPicker, "claude-opus-4-8");

    const preview = within(dialog).getByTestId("ccswitch-import-preview");
    expect(preview).toHaveTextContent("~/.claude/settings.json");
    expect(preview).toHaveTextContent('"ANTHROPIC_MODEL": "claude-sonnet-5"');
    expect(preview).toHaveTextContent('"ANTHROPIC_DEFAULT_FABLE_MODEL": "claude-opus-4-8"');
    expect(preview).not.toHaveTextContent("ANTHROPIC_DEFAULT_HAIKU_MODEL");
    expect(preview).toHaveTextContent(/tiers left empty follow the main model/i);

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        clientType: "claude",
        providerName: "CliProxy Claude Code",
        defaultModel: "claude-sonnet-5",
        endpointPath: "",
        modelMappings: [
          { role: "main", requestModel: "claude-sonnet-5", targetModel: "claude-sonnet-5" },
          { role: "fable", requestModel: "claude-opus-4-8", targetModel: "claude-opus-4-8" },
        ],
      }),
    );
  });

  test("editing an earlier Claude preset keeps its request names and moves only targets", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "grok",
        "path-routes": ["/grok"],
        "allowed-models": ["grok-4.5", "grok-code-fast-1"],
      },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-grok-claude",
        clientType: "claude",
        providerName: "Grok Claude",
        note: "",
        defaultModel: "grok-4.5",
        allowedChannelGroups: ["grok"],
        routePath: "/grok/cs_legacy1",
        endpointPath: "",
        usageAutoInterval: 30,
        modelMappings: [
          { role: "main", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
          { role: "haiku", requestModel: "claude-haiku-4-5", targetModel: "grok-4.5" },
          { role: "fable", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
        ],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Grok Claude");

    // An existing preset keeps its app.
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();
    const main = within(dialog).getByRole("combobox", { name: /^main model$/i });
    expect(main).toHaveTextContent("grok-4.5");
    // Main and Fable share that request name, so both pickers explain it.
    expect(within(dialog).getAllByText(/^sent as claude-fable-5$/i)).toHaveLength(2);

    await pickOption(user, main, "grok-code-fast-1");
    await pickOption(
      user,
      within(dialog).getByRole("combobox", { name: /^haiku default model/i }),
      /same as main model/i,
    );

    const aliasList = within(dialog).getByTestId("ccswitch-alias-list");
    expect(aliasList).toHaveTextContent("claude-haiku-4-5");
    expect(aliasList).toHaveTextContent("grok-4.5");

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        id: "cfg-grok-claude",
        defaultModel: "grok-code-fast-1",
        routePath: "/grok/cs_legacy1",
        modelMappings: [
          { role: "main", requestModel: "claude-fable-5", targetModel: "grok-code-fast-1" },
          { role: "fable", requestModel: "claude-fable-5", targetModel: "grok-code-fast-1" },
          { requestModel: "claude-haiku-4-5", targetModel: "grok-4.5" },
        ],
      }),
    );
  });

  test("editing an earlier Codex preset lists its aliases and saves them untouched", async () => {
    listCapabilities.mockReturnValue({ codexContextWindow: true });
    listChannelGroups.mockResolvedValue([
      {
        name: "kimicode",
        "path-routes": ["/kimicode"],
        "allowed-models": ["gpt-5.5", "kimi-k2.5"],
      },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-kimi",
        clientType: "codex",
        providerName: "Relay Kimi",
        note: "saved mapping",
        defaultModel: "gpt-5.4-mini",
        allowedChannelGroups: ["kimicode"],
        routePath: "/kimicode/cs_kimi01",
        endpointPath: "/v1",
        usageAutoInterval: 45,
        modelMappings: [
          { requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 128000 },
          { requestModel: "gpt-5.4-mini", targetModel: "kimi-k2.5", contextWindow: 128000 },
        ],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Relay Kimi");

    expect(defaultModelPicker(dialog)).toHaveTextContent("kimi-k2.5");
    expect(within(dialog).getByText(/^sent as gpt-5\.4-mini$/i)).toBeInTheDocument();
    const aliasList = within(dialog).getByTestId("ccswitch-alias-list");
    expect(aliasList).toHaveTextContent("gpt-5.4-mini");
    expect(aliasList).toHaveTextContent("kimi-k2.5");
    // The earlier editor's per-mapping 128000 is neither the preset's window nor in the link.
    expect(within(dialog).getByRole("spinbutton", { name: /^context window/i })).toHaveValue(null);
    expect(within(dialog).getByTestId("ccswitch-import-preview")).not.toHaveTextContent(
      "model_context_window",
    );

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        id: "cfg-kimi",
        defaultModel: "gpt-5.4-mini",
        usageAutoInterval: 45,
        modelMappings: [
          { requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 128000 },
          { requestModel: "gpt-5.4-mini", targetModel: "kimi-k2.5", contextWindow: 128000 },
        ],
      }),
    );
    expect(savedConfig()).not.toHaveProperty("codexContextWindow");
  });

  test("hides the Codex context window from a backend that cannot store it", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", "path-routes": ["/pro"], "allowed-models": ["gpt-5.5", "kimi-k2"] },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /pro.*\/pro/i);

    expect(within(dialog).queryByRole("spinbutton", { name: /^context window/i })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(replaceConfigs).toHaveBeenCalled());
    expect(replaceConfigs.mock.calls.at(-1)?.[1]).toEqual({ codexContextWindow: false });
  });

  test("suggests the usual default model and keeps the admin's own pick afterwards", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        "path-routes": ["/pro"],
        "allowed-models": ["deepseek-v4-flash", "gpt-5.3-codex", "gpt-5.5", "kimi-k2"],
      },
      {
        name: "team-a",
        "path-routes": ["/team-a"],
        "allowed-models": ["gpt-5.5", "kimi-k2"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    await pickGroup(user, dialog, /pro.*\/pro/i);
    await waitFor(() => expect(defaultModelPicker(dialog)).toHaveTextContent("gpt-5.5"));

    await pickOption(user, defaultModelPicker(dialog), "kimi-k2");
    // Another group that also serves the pick keeps it instead of suggesting gpt-5.5 again.
    await pickGroup(user, dialog, /team-a.*\/team-a/i);
    await waitFor(() => expect(defaultModelPicker(dialog)).toHaveTextContent("kimi-k2"));
  });

  test("deleting the default alias keeps the default on its model under the model's own name", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "kimicode", "path-routes": ["/kimicode"], "allowed-models": ["kimi-k2.5"] },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-kimi",
        clientType: "codex",
        providerName: "Relay Kimi",
        defaultModel: "gpt-5.4-mini",
        allowedChannelGroups: ["kimicode"],
        routePath: "/kimicode/cs_kimi01",
        modelMappings: [{ requestModel: "gpt-5.4-mini", targetModel: "kimi-k2.5" }],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Relay Kimi");
    // Only the alias is on the route: the picker has models to offer but none ticked.
    expect(within(dialog).getByRole("combobox", { name: /^featured models/i })).toHaveTextContent(
      /^no other models$/i,
    );

    await user.click(within(dialog).getByRole("button", { name: /delete gpt-5\.4-mini/i }));
    expect(within(dialog).queryByTestId("ccswitch-alias-list")).not.toBeInTheDocument();
    expect(defaultModelPicker(dialog)).toHaveTextContent("kimi-k2.5");

    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        defaultModel: "kimi-k2.5",
        modelMappings: [{ requestModel: "kimi-k2.5", targetModel: "kimi-k2.5" }],
      }),
    );
  });

  test("shows a saved preset immediately while its group's models still load", async () => {
    const modelsDeferred = createDeferred<{ id: string }[]>();
    listChannelGroups.mockResolvedValue([{ name: "kimicode", "path-routes": ["/kimicode"] }]);
    listAvailableModels.mockReturnValue(modelsDeferred.promise);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-kimi",
        clientType: "codex",
        providerName: "Relay Kimi",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["kimicode"],
        routePath: "/kimicode/cs_kimi01",
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "moonshot-v1-128k" }],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Relay Kimi");

    expect(within(dialog).getByText(/loading models/i)).toBeInTheDocument();
    expect(defaultModelPicker(dialog)).toHaveTextContent("moonshot-v1-128k");
    modelsDeferred.resolve([{ id: "kimi-k2.5" }]);
    await waitFor(() =>
      expect(within(dialog).queryByText(/loading models/i)).not.toBeInTheDocument(),
    );

    // Loading the group's models does not re-seed an existing preset.
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "moonshot-v1-128k" }],
      }),
    );
  });

  test("warns that a new channel group changes the endpoint of an existing preset", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", "path-routes": ["/pro"], "allowed-models": ["gpt-5.5"] },
      { name: "team-a", "path-routes": ["/team-a"], "allowed-models": ["gpt-5.5"] },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-move",
        clientType: "codex",
        providerName: "Relay Pro",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["pro"],
        routePath: "/pro/cs_saved01",
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "gpt-5.5" }],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Relay Pro");

    expect(within(dialog).queryByText(/changes the endpoint address/i)).not.toBeInTheDocument();
    await pickGroup(user, dialog, /team-a.*\/team-a/i);
    expect(within(dialog).getByText(/changes the endpoint address/i)).toBeInTheDocument();
    expect(within(dialog).getByTestId("ccswitch-config-endpoint-preview").textContent).toMatch(
      /\/team-a\/cs_[a-z0-9]+\/v1$/,
    );
    await pickGroup(user, dialog, /pro.*\/pro/i);
    expect(within(dialog).queryByText(/changes the endpoint address/i)).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("ccswitch-config-endpoint-preview").textContent).toMatch(
      /\/pro\/cs_saved01\/v1$/,
    );
  });

  test("Gemini names starting with Google are renamed so CC Switch keeps the API key", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", "path-routes": ["/pro"], "allowed-models": ["gemini-2.5-pro"] },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole("tab", { name: "Gemini CLI" }));
    await user.clear(nameInput(dialog));
    await user.type(nameInput(dialog), "Google relay");

    expect(within(dialog).getByText(/official sign-in/i)).toHaveTextContent(
      "CliProxy Google relay",
    );
    await pickGroup(user, dialog, /pro.*\/pro/i);
    const preview = within(dialog).getByTestId("ccswitch-import-preview");
    expect(preview).toHaveTextContent("~/.gemini/.env");
    // The group serves one model, so it is picked as the default.
    expect(preview).toHaveTextContent("GEMINI_MODEL=gemini-2.5-pro");
  });

  test("uses the channel group allowed models as the authoritative model list", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "chatgpt-pro",
        description: "ChatGPT Pro route",
        "path-routes": ["/openai/pro"],
        "allowed-models": ["codex-auto-review", "gpt-5", "gpt-5.5"],
      },
    ]);
    listAvailableModels.mockResolvedValue([{ id: "gpt-5" }, { id: "unexpected-extra-model" }]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /chatgpt-pro.*\/openai\/pro/i);

    const groupSelect = within(dialog).getByRole("combobox", { name: /^channel group$/i });
    expect(groupSelect).toHaveTextContent("chatgpt-pro");
    expect(groupSelect).toHaveTextContent("/openai/pro");
    expect(await optionNames(user, defaultModelPicker(dialog))).toEqual([
      "codex-auto-review",
      "gpt-5",
      "gpt-5.5",
    ]);
    expect(listAvailableModels).not.toHaveBeenCalled();
  });

  // The group refuses what it excludes, so an excluded model offered here became a preset
  // whose requests were rejected with a 403.
  test("leaves models the channel group excludes out of the candidates", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "chatgpt-pro",
        channels: ["A_GptPro"],
        "path-routes": ["/openai/pro"],
        // Matched like the backend does: through the route prefix and the wildcard.
        "excluded-models": ["gpt-image-*", "openai/gpt-5-codex"],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "gpt-5" },
      { id: "gpt-5-codex" },
      { id: "gpt-5.5" },
      { id: "gpt-image-2" },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /chatgpt-pro.*\/openai\/pro/i);

    await waitFor(() => expect(listAvailableModels).toHaveBeenCalled());
    await waitFor(async () =>
      expect(await optionNames(user, defaultModelPicker(dialog))).toEqual(["gpt-5", "gpt-5.5"]),
    );
  });

  test("applies a channel group's exclusions to its allow list too", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "pro",
        "path-routes": ["/pro"],
        "allowed-models": ["deepseek-v4-flash", "kimi-k2"],
        "excluded-models": ["DeepSeek-*"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /pro.*\/pro/i);

    expect(await optionNames(user, defaultModelPicker(dialog))).toEqual(["kimi-k2"]);
    // A single model is picked for you.
    expect(defaultModelPicker(dialog)).toHaveTextContent("kimi-k2");
  });

  // A group that follows upstream also serves what Codex discovery listed after
  // its allow list was saved, so a preset can pick those. A frozen group's
  // would-be additions are not offered: requests for them are refused.
  test("offers what a following group admits beyond its allow list, and only then", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "following",
        "path-routes": ["/following"],
        "allowed-models": ["gpt-6.1-sol"],
        "follow-upstream-models": true,
        "discovered-models": ["gpt-6.1-terra"],
      },
      {
        name: "frozen",
        "path-routes": ["/frozen"],
        "allowed-models": ["gpt-6.1-sol"],
        "discovered-models": ["gpt-6.1-terra"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    await pickGroup(user, dialog, /following.*\/following/i);
    expect(await optionNames(user, defaultModelPicker(dialog))).toEqual([
      "gpt-6.1-sol",
      "gpt-6.1-terra",
    ]);
    await pickGroup(user, dialog, /frozen.*\/frozen/i);
    await waitFor(async () =>
      expect(await optionNames(user, defaultModelPicker(dialog))).toEqual(["gpt-6.1-sol"]),
    );
  });

  // The preset of the 2026-10-28 report kept gpt-5.4 as its default model after
  // its group's allow list stopped naming it, so every request for it failed.
  test("points out preset models the channel group refuses, in the list and the editor", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "deepseekv4flash+chatgpt",
        "path-routes": ["/chatgpt"],
        "allowed-models": ["gpt-6.1-sol"],
      },
    ]);
    listConfigs.mockResolvedValue([
      {
        id: "cfg-pro",
        clientType: "codex",
        providerName: "gpt pro pool",
        defaultModel: "gpt-5.4",
        allowedChannelGroups: ["deepseekv4flash+chatgpt"],
        routePath: "/deepseekv4flash-chatgpt/cs_3e13ca9880fc",
        modelMappings: [
          { requestModel: "gpt-5.4", targetModel: "gpt-5.4" },
          { requestModel: "gpt-6.1-sol", targetModel: "gpt-6.1-sol" },
        ],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByTestId("ccswitch-row-unserved-models")).toHaveAccessibleName(
      /does not allow these models.*: gpt-5\.4$/i,
    );
    const dialog = await openEdit(user, "gpt pro pool");
    expect(within(dialog).getByTestId("ccswitch-unserved-models")).toHaveTextContent(
      'Channel group "deepseekv4flash+chatgpt" does not allow these models, so requests for them are refused: gpt-5.4',
    );
  });

  test("filters fallback channel group models by configured model availability", async () => {
    listChannelGroups.mockResolvedValue([
      {
        name: "chatgpt-pro",
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
      { id: "gpt-5.3-codex" },
      { id: "gpt-5.5" },
    ]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [
        { id: "gpt-5", owned_by: "openai" },
        { id: "gpt-5-codex", owned_by: "openai" },
        { id: "gpt-5.3-codex", owned_by: "codex" },
        { id: "gpt-5.5", owned_by: "codex" },
      ],
      idSet: new Set(["codex-auto-review", "gpt-5", "gpt-5-codex", "gpt-5.3-codex", "gpt-5.5"]),
    });
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /chatgpt-pro.*\/openai\/pro/i);

    await waitFor(() =>
      expect(listAvailableModels).toHaveBeenCalledWith({ allowedChannels: ["A_GptPro"] }),
    );
    await waitFor(async () =>
      expect(await optionNames(user, defaultModelPicker(dialog))).toEqual([
        "gpt-5.3-codex",
        "gpt-5.5",
      ]),
    );
    expect(loadConfiguredModelAvailability).toHaveBeenCalledWith(undefined);
    expect(getModelConfigs).not.toHaveBeenCalled();
  });

  test("uses the auth-file owner model group as the model source", async () => {
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({ kimi: "kimi-code" });
    listChannelGroups.mockResolvedValue([
      {
        name: "kimicode",
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
    listAvailableModels.mockResolvedValue([{ id: "kimi-k2" }, { id: "kimi-k2.5" }]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [
        { id: "kimi-k2.5", owned_by: "kimi-code" },
        { id: "kimi-k2.6", owned_by: "kimi-code" },
        { id: "kimi-k2.7-code", owned_by: "kimi-code" },
      ],
      idSet: new Set(["kimi-k2.5", "kimi-k2.6"]),
    });
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole("tab", { name: "Claude Code" }));
    await pickGroup(user, dialog, /kimicode.*\/kimicode/i);

    const main = within(dialog).getByRole("combobox", { name: /^main model$/i });
    await waitFor(async () =>
      expect(await optionNames(user, main)).toEqual(["kimi-k2.5", "kimi-k2.6", "kimi-k2.7-code"]),
    );
    expect(listAvailableModels).toHaveBeenCalledWith({ allowedChannels: ["kimi"] });
    expect(getModelConfigs).not.toHaveBeenCalled();
  });

  test("hydrates a mixed Kimi and OpenCode Go group from its resolved channels", async () => {
    getAuthGroupModelOwnerMappingMap.mockResolvedValue({ kimi: "kimi-code" });
    listChannelGroups.mockResolvedValue([
      {
        name: "kimi+deepseek v4 flash",
        channels: ["kimi-code", "opencode"],
        channelDetails: [
          {
            name: "kimi-code",
            source: "openai",
            default_tags: ["openai"],
            custom_tags: ["kimi-code"],
            display_tags: ["kimi-code"],
          },
          {
            name: "opencode",
            source: "opencode-go",
            default_tags: ["opencode-go"],
            custom_tags: ["opencode"],
            display_tags: ["opencode"],
          },
        ],
        "path-routes": ["/deepseekkimi"],
      },
    ]);
    listAvailableModels.mockResolvedValue([
      { id: "deepseek-v4-flash" },
      { id: "kimi-k2.5" },
      { id: "qwen3.5-plus" },
    ]);
    loadConfiguredModelAvailability.mockResolvedValue({
      scoped: true,
      items: [
        { id: "deepseek-v4-flash", owned_by: "opencode", source: "seed" },
        { id: "kimi-k2.5", owned_by: "kimi-code", source: "seed" },
        { id: "kimi-k2.7", owned_by: "kimi-code", source: "seed" },
        { id: "qwen3.5-plus", owned_by: "opencode", source: "seed" },
        { id: "unrelated-openai", owned_by: "openai", source: "seed" },
      ],
      idSet: new Set(["deepseek-v4-flash", "kimi-k2.5", "kimi-k2.7", "qwen3.5-plus"]),
    });
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await pickGroup(user, dialog, /kimi\+deepseek v4 flash.*\/deepseekkimi/i);

    await waitFor(async () =>
      expect(await optionNames(user, defaultModelPicker(dialog))).toEqual([
        "deepseek-v4-flash",
        "kimi-k2.5",
        "kimi-k2.7",
        "qwen3.5-plus",
      ]),
    );
    expect(listAvailableModels).toHaveBeenCalledWith({
      allowedChannels: ["kimi-code", "opencode"],
    });
  });

  test("deletes a saved config row through the API", async () => {
    listConfigs.mockResolvedValue([
      {
        id: "cfg-1",
        clientType: "hermes",
        providerName: "Relay Hermes",
        note: "Delete me",
        defaultModel: "kimi-k2",
        allowedChannelGroups: ["team-a"],
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText("Relay Hermes")).toBeInTheDocument();
    expect(screen.getByTestId("ccswitch-client-icon-hermes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete config/i }));
    const dialog = await screen.findByRole("dialog", { name: /delete cc switch config/i });
    expect(dialog).toHaveTextContent("Hermes");
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(replaceConfigs).toHaveBeenCalledWith([], { codexContextWindow: false }),
    );
  });

  test("filters out implicit channel groups except default", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", description: "Pro route", "path-routes": ["/pro"] },
      { name: "default", implicit: true },
      { name: "nvidia", implicit: true },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openCreate(user);

    await user.click(within(dialog).getByRole("combobox", { name: /^channel group$/i }));
    const labels = (await screen.findAllByRole("option")).map((el) => el.textContent ?? "");
    expect(labels.some((text) => text.includes("pro"))).toBe(true);
    expect(labels.some((text) => text.includes("default"))).toBe(true);
    expect(labels.some((text) => text.includes("nvidia"))).toBe(false);
  });

  test("keeps a hidden channel group when editing a preset that uses one", async () => {
    listChannelGroups.mockResolvedValue([
      { name: "pro", "path-routes": ["/pro"] },
      { name: "nvidia", implicit: true },
    ]);
    listAvailableModels.mockResolvedValue(Array<unknown>());
    listConfigs.mockResolvedValue([
      {
        id: "cfg-nvidia",
        clientType: "codex",
        providerName: "Relay NVIDIA",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["nvidia"],
        routePath: "/nvidia/cs_nvidia1",
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "mistral-7b" }],
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    const dialog = await openEdit(user, "Relay NVIDIA");

    expect(within(dialog).getByRole("combobox", { name: /^channel group$/i })).toHaveTextContent(
      /nvidia/i,
    );
    await user.click(within(dialog).getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(savedConfig()).toMatchObject({
        id: "cfg-nvidia",
        allowedChannelGroups: ["nvidia"],
        modelMappings: [{ requestModel: "gpt-5.5", targetModel: "mistral-7b" }],
      }),
    );
  });
});
