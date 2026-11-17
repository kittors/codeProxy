import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
import {
  chooseInFacet,
  deferred,
  facetButton,
  findLogGrid,
  legacyItem,
  logItem,
  logsAnswer,
  queryOf,
  renderRequestLogsPage,
} from "./requestLogsTestKit";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
  clearUsageLogs: vi.fn(),
  getRequestLogBodyStorage: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    usageApi: {
      ...mod.usageApi,
      getUsageLogs: mocks.getUsageLogs,
      getLogContent: mocks.getLogContent,
      clearUsageLogs: mocks.clearUsageLogs,
    },
    configApi: {
      ...mod.configApi,
      getRequestLogBodyStorage: mocks.getRequestLogBodyStorage,
      getConfig: mocks.getConfig,
    },
  };
});

/** Facets of an older backend: keys by their (masked) secret. */
const secretFacet: Partial<UsageLogsResponse["filters"]> = {
  api_keys: ["sk-primary", "sk-secondary"],
  api_key_names: { "sk-primary": "Primary", "sk-secondary": "Secondary" },
  api_key_counts: { "sk-primary": 12, "sk-secondary": 37 },
  models: ["gpt-5.4", "gpt-4.1"],
  channels: ["Codex", "Relay"],
  channel_options: [
    {
      value: "auth-codex",
      label: "Codex",
      provider: "codex",
      auth_type: "oauth",
      auth_index: "auth-codex",
    },
    {
      value: "auth-relay",
      label: "Relay",
      provider: "openai",
      auth_type: "api",
      auth_index: "auth-relay",
    },
  ],
  statuses: ["success", "failed"],
};

/** A current backend: keys by their stable id, system calls as one entry. */
const idFacet: Partial<UsageLogsResponse["filters"]> = {
  ...secretFacet,
  api_key_ids: ["key-primary", "key-secondary", "__system__"],
  api_key_id_names: { "key-primary": "Primary", "key-secondary": "Secondary" },
  api_key_id_counts: { "key-primary": 12, "key-secondary": 37, __system__: 4 },
  api_keys: [],
  api_key_names: {},
  api_key_counts: {},
};

const calls = () => mocks.getUsageLogs.mock.calls;
const nthQuery = (n: number) => queryOf(calls(), n) ?? {};
const lastQuery = () => queryOf(calls()) ?? {};

async function tooltipOf(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  await user.hover(target);
  const tooltip = await screen.findByRole("tooltip");
  const text = tooltip.textContent ?? "";
  await user.unhover(target);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  return text;
}

describe("RequestLogsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getRequestLogBodyStorage.mockResolvedValue(false);
    mocks.getConfig.mockResolvedValue({});
  });

  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.clear();
    mocks.getUsageLogs.mockReset();
    mocks.getLogContent.mockReset();
    mocks.clearUsageLogs.mockReset();
    mocks.getRequestLogBodyStorage.mockReset();
    mocks.getConfig.mockReset();
  });

  describe("cells", () => {
    test("a row says who sent it, on which channel and how long it took; exact values are in the tooltips", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer(
          [
            logItem({
              id: 1,
              end_user_display_name: "Zhang Bolun",
              api_key_own_name: "Laptop",
              channel_name: "asherandersenloqv@outlook.com",
              provider: "xai",
              auth_type: "oauth",
            }),
            logItem({ id: 2, channel_name: "Relay", provider: "openai", auth_type: "api" }),
          ],
          { filters: secretFacet },
        ),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();

      expect(within(grid).getByRole("columnheader", { name: "User / key" })).toBeInTheDocument();
      expect(await within(grid).findByText("Zhang Bolun")).toBeInTheDocument();
      // The key's own name is the second line when it differs from the person.
      expect(within(grid).getByText("Laptop")).toBeInTheDocument();
      expect(await tooltipOf(user, within(grid).getByText("Zhang Bolun"))).toContain("Laptop");

      expect(within(grid).getByText("asherandersenloqv@outlook.com")).toBeInTheDocument();
      expect(within(grid).getByText("Relay")).toBeInTheDocument();
      expect(within(grid).getAllByText(/OAuth/).length).toBeGreaterThanOrEqual(1);
      expect(within(grid).getAllByText(/^API$/).length).toBeGreaterThanOrEqual(1);

      // Duration on the first line, the first token under it; the split is in the tooltip.
      const durations = within(grid).getAllByText("1.2s");
      expect(durations).toHaveLength(2);
      expect(within(grid).getAllByText("183ms").length).toBeGreaterThanOrEqual(2);
      const latencyTip = await tooltipOf(user, durations[0]);
      expect(latencyTip).toContain("First Token Latency");
      expect(latencyTip).toContain("183ms");
      expect(latencyTip).toContain("Streaming");
    });

    test("a non-streaming request says so instead of a first-token placeholder", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([logItem({ streaming: false, first_token_ms: 0 })]),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect((await within(grid).findAllByText("Non-streaming")).length).toBeGreaterThanOrEqual(1);
      expect(within(grid).queryByText("First token")).toBeNull();
    });

    test("a thinking level is its own tag next to the model, and an empty one adds nothing", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([
          logItem({ id: 1, model: "gpt-5.6-sol", thinking_level: " max " }),
          logItem({ id: 2, model: "gpt-5.4", thinking_level: "" }),
        ]),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByText("gpt-5.6-sol")).toBeInTheDocument();
      expect(within(grid).getByText("max")).toBeInTheDocument();
      expect(within(grid).getByText("gpt-5.4")).toBeInTheDocument();
      expect(within(grid).queryByText("gpt-5.4()")).toBeNull();
    });

    test("a vision fallback and a real-model mapping are told apart", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([
          logItem({
            id: 1,
            model: "cline-pass/deepseek-v4-pro",
            upstream_model: "",
            vision_fallback_model: "cline-pass/mimo-v2.5-pro",
          }),
          logItem({
            id: 2,
            model: "alias-model",
            upstream_model: "real-model",
            vision_fallback_model: "",
          }),
        ]),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByText("cline-pass/deepseek-v4-pro")).toBeInTheDocument();
      expect(within(grid).getByText("alias-model")).toBeInTheDocument();

      const vision = within(grid).getByLabelText(
        "Vision fallback model ID: cline-pass/mimo-v2.5-pro",
      );
      expect(await tooltipOf(user, vision)).toContain("cline-pass/mimo-v2.5-pro");
      const real = within(grid).getByLabelText("Real model ID: real-model");
      expect(await tooltipOf(user, real)).toContain("real-model");
    });

    test("no real-model marker when the upstream name is only the alias without its prefix", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([
          logItem({
            model: "ollama/deepseek-v4-flash:0731",
            upstream_model: "deepseek-v4-flash:0731",
          }),
        ]),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByText("ollama/deepseek-v4-flash:0731")).toBeInTheDocument();
      expect(within(grid).queryByLabelText(/^Real model ID/)).toBeNull();
    });

    test("an empty answer is the no-data state, not a no-match one", async () => {
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([], { filters: { statuses: [] } }));
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByText("No request logs yet")).toBeInTheDocument();
      expect(within(grid).queryByText("No requests match")).toBeNull();
    });

    test("missing values are a dash, never a -- placeholder", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([
          logItem({ id: 1, latency_ms: 354, first_token_ms: 0, output_tokens: 0, streaming: true }),
          logItem({ id: 2, latency_ms: -1, first_token_ms: 0, output_tokens: 0, streaming: false }),
        ]),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByText("354ms")).toBeInTheDocument();
      expect(within(grid).getAllByText("—").length).toBeGreaterThan(0);
      expect(within(grid).queryByText("--")).toBeNull();
      expect(grid.textContent).not.toContain("--");
    });

    test("cells stay compact; the exact numbers are on the content buttons and in the summary's hints", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer(
          [
            logItem({
              input_tokens: 2_806_800_000,
              cached_tokens: 2_576_200_000,
              output_tokens: 13_100_000,
              total_tokens: 2_819_900_000,
              cost: 12_345.67891,
              has_content: true,
            }),
          ],
          {
            stats: {
              total: 1,
              success_rate: 100,
              total_tokens: 2_819_900_000,
              total_cost: 12_345.67891,
            },
          },
        ),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();

      const input = await within(grid).findByRole("button", {
        name: "Click to view input · 2,806,800,000",
      });
      expect(input).toHaveTextContent("2.81B");
      expect(
        within(grid).getByRole("button", { name: "Click to view output · 13,100,000" }),
      ).toHaveTextContent("13.1M");

      const tokens = screen.getByText("Total Token", { selector: "span.text-ink-3" });
      expect(tokens.nextElementSibling).toHaveTextContent("2.82B");
      expect(await tooltipOf(user, tokens)).toContain("2,819,900,000");
    });
  });

  test("aborts stale request-log loads and keeps the latest response", async () => {
    const user = userEvent.setup();
    const first = deferred<UsageLogsResponse>();
    const second = deferred<UsageLogsResponse>();
    let firstSignal: AbortSignal | undefined;
    mocks.getUsageLogs
      .mockImplementationOnce((_params, options?: { signal?: AbortSignal }) => {
        firstSignal = options?.signal;
        return first.promise;
      })
      .mockImplementationOnce((_params, options?: { signal?: AbortSignal }) => {
        expect(options?.signal).toBeInstanceOf(AbortSignal);
        return second.promise;
      });
    renderRequestLogsPage();

    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("tab", { name: "Today" }));
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    second.resolve(logsAnswer([logItem({ id: 2, model: "latest-model" })]));
    expect(await screen.findByText("latest-model")).toBeInTheDocument();
    first.resolve(logsAnswer([logItem({ id: 1, model: "stale-model" })]));
    await waitFor(() => expect(screen.queryByText("stale-model")).toBeNull());
  });

  describe("filters", () => {
    test("users are listed by call count, most first, and nothing is selected by default", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([], { filters: secretFacet }));
      renderRequestLogsPage();
      await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

      // Nothing selected means no filter: the empty selection is never sent as "match nothing".
      // (Before the first answer the page speaks the key-id vocabulary of a current backend.)
      const first = nthQuery(1);
      expect(first.api_key_ids).toBeUndefined();
      expect(first.api_key_ids_empty).toBe(false);
      for (const key of ["models", "channels", "statuses"]) expect(first[key]).toBeUndefined();
      for (const key of ["models_empty", "channels_empty", "statuses_empty"]) {
        expect(first).not.toHaveProperty(key);
      }

      await user.click(facetButton("User / key"));
      const dialog = await screen.findByRole("dialog", { name: /Filter .User \/ key./ });
      const options = within(dialog).getAllByRole("checkbox");
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveAccessibleName(/Secondary.*37/);
      expect(options[1]).toHaveAccessibleName(/Primary.*12/);
      for (const option of options) expect(option).not.toBeChecked();
    });

    test("user selections apply only after Apply, several at a time, and Reset goes back to everyone", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([], {
          filters: {
            ...secretFacet,
            api_keys: ["sk-primary", "sk-secondary", "sk-tertiary"],
            api_key_names: { ...secretFacet.api_key_names, "sk-tertiary": "Tertiary" },
            api_key_counts: { ...secretFacet.api_key_counts, "sk-tertiary": 5 },
          },
        }),
      );
      renderRequestLogsPage();
      await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

      await chooseInFacet(user, "User / key", [/Primary/], { apply: false });
      // Ticking is a draft: nothing is fetched until Apply.
      expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(nthQuery(2).api_keys).toEqual(["sk-primary"]));
      expect(nthQuery(2).api_keys_empty).toBe(false);
      expect(facetButton("User / key")).toHaveTextContent("1");

      await chooseInFacet(user, "User / key", [/Secondary/]);
      // The selection is kept in the facet's own order (by call count).
      await waitFor(() => expect(nthQuery(3).api_keys).toEqual(["sk-secondary", "sk-primary"]));

      await user.click(facetButton("User / key"));
      const dialog = await screen.findByRole("dialog", { name: /Filter .User \/ key./ });
      await user.click(within(dialog).getByRole("button", { name: "Reset" }));
      expect(mocks.getUsageLogs).toHaveBeenCalledTimes(3);
      await user.click(within(dialog).getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(calls()).toHaveLength(4));
      expect(nthQuery(4).api_keys).toBeUndefined();
      expect(nthQuery(4).api_keys_empty).toBe(false);
    });

    test("unticking the last selected user goes back to every user", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([], { filters: secretFacet }));
      renderRequestLogsPage();
      await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

      await chooseInFacet(user, "User / key", [/Primary/]);
      await waitFor(() => expect(nthQuery(2).api_keys).toEqual(["sk-primary"]));

      await user.click(facetButton("User / key"));
      const dialog = await screen.findByRole("dialog", { name: /Filter .User \/ key./ });
      const primary = within(dialog).getByRole("checkbox", { name: /Primary/ });
      expect(primary).toBeChecked();
      await user.click(primary);
      await user.click(within(dialog).getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(calls()).toHaveLength(3));
      expect(nthQuery(3).api_keys).toBeUndefined();
      // The facet button drops its count badge: nothing is filtered by user any more.
      expect(facetButton("User / key")).toHaveAccessibleName("User / key");
    });

    test("a channel filter survives a time range whose answer has no channel options", async () => {
      const user = userEvent.setup();
      const restored = logsAnswer([logItem({ id: 7, model: "restored-model" })], {
        filters: secretFacet,
      });
      mocks.getUsageLogs.mockImplementation((params: { days?: number }) =>
        Promise.resolve(
          params.days === 1 ? logsAnswer([], { filters: { statuses: [] } }) : restored,
        ),
      );
      renderRequestLogsPage();
      expect(await screen.findByText("restored-model")).toBeInTheDocument();

      await chooseInFacet(user, "Channel", [/Relay/]);
      await waitFor(() => expect(nthQuery(2)).toMatchObject({ days: 7, channels: ["auth-relay"] }));

      await user.click(screen.getByRole("tab", { name: "Today" }));
      await waitFor(() => expect(nthQuery(3)).toMatchObject({ days: 1, channels: ["auth-relay"] }));
      await waitFor(() => expect(screen.queryByText("restored-model")).toBeNull());
      // The chip still says what is filtered, so it can be removed from here.
      expect(screen.getByRole("button", { name: /^Remove filter: Channel/ })).toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "7 days" }));
      await waitFor(() => expect(nthQuery(4)).toMatchObject({ days: 7, channels: ["auth-relay"] }));
      expect(await screen.findByText("restored-model")).toBeInTheDocument();
    });

    test("the status tabs pick one status; the status column offers only the statuses the backend lists", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([logItem()], { filters: { ...secretFacet, statuses: ["success"] } }),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      await within(grid).findByText("Primary");

      const tabs = screen.getByRole("tablist", { name: "Filter by status" });
      await user.click(within(tabs).getByRole("tab", { name: "Failed" }));
      await waitFor(() => expect(lastQuery().statuses).toEqual(["failed"]));
      await user.click(within(tabs).getByRole("tab", { name: "All" }));
      await waitFor(() => expect(lastQuery().statuses).toBeUndefined());

      await user.click(within(grid).getByRole("button", { name: /Filter .Status./ }));
      const menu = await screen.findByRole("dialog", { name: /Status. column options/ });
      const statuses = within(menu).getAllByRole("checkbox");
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toHaveAccessibleName(/Success/);
    });

    test("removing a chip clears that filter and loads the table again", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs
        .mockResolvedValueOnce(
          logsAnswer([logItem({ model: "gpt-5.4" })], { filters: secretFacet }),
        )
        .mockResolvedValueOnce(
          logsAnswer([logItem({ model: "gpt-5.4" })], { filters: secretFacet }),
        )
        .mockResolvedValue(
          logsAnswer([logItem({ id: 9, model: "gpt-4.1" })], { filters: secretFacet }),
        );
      renderRequestLogsPage();
      expect(await screen.findByText("gpt-5.4", { selector: "span" })).toBeInTheDocument();

      await chooseInFacet(user, "Model", [/gpt-5\.4/]);
      await waitFor(() => expect(nthQuery(2).models).toEqual(["gpt-5.4"]));

      await user.click(screen.getByRole("button", { name: "Remove filter: Model: gpt-5.4" }));
      await waitFor(() => expect(calls()).toHaveLength(3));
      expect(nthQuery(3).models).toBeUndefined();
      expect(await within(await findLogGrid()).findByText("gpt-4.1")).toBeInTheDocument();
    });

    test("the bulk action selects every option, or only the matches while searching", async () => {
      const user = userEvent.setup();
      const models = [
        "gpt-5.4",
        "gpt-4.1",
        "gpt-5.1-codex",
        "claude-opus-5",
        "claude-sonnet-5",
        "gemini-3",
        "glm-5",
        "kimi-k3",
      ];
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([], { filters: { ...secretFacet, models } }));
      renderRequestLogsPage();
      await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

      await user.click(facetButton("Model"));
      const dialog = await screen.findByRole("dialog", { name: /Filter .Model./ });
      expect(within(dialog).getByRole("button", { name: "Select all" })).toBeInTheDocument();
      expect(within(dialog).queryByRole("button", { name: "Select matches" })).toBeNull();

      await user.type(within(dialog).getByRole("textbox", { name: "Search options" }), "claude");
      await user.click(within(dialog).getByRole("button", { name: "Select matches" }));
      await user.click(within(dialog).getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(nthQuery(2).models).toEqual(["claude-opus-5", "claude-sonnet-5"]));
    });

    describe("key filter", () => {
      test("selects keys by id when the backend declares the id filters", async () => {
        const user = userEvent.setup();
        mocks.getUsageLogs.mockResolvedValue(
          logsAnswer([], { capabilities: { apiKeyIdFilters: true }, filters: idFacet }),
        );
        renderRequestLogsPage();
        await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

        const dialog = await chooseInFacet(user, "User / key", [], { apply: false });
        // Names for keys, one entry for every system call.
        expect(within(dialog).getByRole("checkbox", { name: /Secondary/ })).toBeInTheDocument();
        expect(within(dialog).getByRole("checkbox", { name: /System Call/ })).toBeInTheDocument();
        await user.click(within(dialog).getByRole("checkbox", { name: /Primary/ }));
        await user.click(within(dialog).getByRole("button", { name: "Apply" }));
        await waitFor(() => expect(nthQuery(2).api_key_ids).toEqual(["key-primary"]));
        expect(nthQuery(2).api_key_ids_empty).toBe(false);
        // An older backend would ignore key ids, so the selectors are not sent as well.
        expect(nthQuery(2)).not.toHaveProperty("api_keys");

        await chooseInFacet(user, "User / key", [/System Call/]);
        await waitFor(() => expect(nthQuery(3).api_key_ids).toEqual(["key-primary", "__system__"]));
      });

      test("never shows the secret of a key an older backend lists", async () => {
        const user = userEvent.setup();
        mocks.getUsageLogs.mockResolvedValue(
          logsAnswer([], {
            filters: {
              ...secretFacet,
              api_keys: ["sk-unnamed-secret-0001"],
              api_key_names: {},
              api_key_counts: { "sk-unnamed-secret-0001": 3 },
            },
          }),
        );
        renderRequestLogsPage();
        await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));
        const dialog = await chooseInFacet(user, "User / key", [], { apply: false });
        expect(
          within(dialog).getByRole("checkbox", { name: /sk-unn\*\*\*0001/ }),
        ).toBeInTheDocument();
        expect(document.body.textContent).not.toContain("sk-unnamed-secret-0001");
      });

      test("drops a selection the new backend does not know when the vocabulary changes", async () => {
        const user = userEvent.setup();
        // The page was opened against an older backend, which has since been upgraded.
        mocks.getUsageLogs
          .mockResolvedValueOnce(logsAnswer([], { filters: secretFacet }))
          .mockResolvedValue(
            logsAnswer([], { capabilities: { apiKeyIdFilters: true }, filters: idFacet }),
          );
        renderRequestLogsPage();
        await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1));

        await chooseInFacet(user, "User / key", [/Primary/]);
        await waitFor(() => expect(nthQuery(2).api_keys).toEqual(["sk-primary"]));
        // The answer came in key ids: the secret that was selected means nothing to it, so the page
        // goes back to every key instead of showing an empty list.
        await waitFor(() => expect(calls().length).toBeGreaterThanOrEqual(3));
        expect(nthQuery(3).api_key_ids).toBeUndefined();
        expect(nthQuery(3).api_key_ids_empty).toBe(false);
        expect(facetButton("User / key")).toHaveAccessibleName("User / key");
      });
    });
  });

  describe("the Agent column", () => {
    const clientFacet: Partial<UsageLogsResponse["filters"]> = {
      ...secretFacet,
      client_names: ["codex-cli", "claude-code", "__unknown__"],
      client_name_counts: { "codex-cli": 5, "claude-code": 9, __unknown__: 1 },
    };

    test("shows the client, its version and, on hover, the raw User-Agent", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer(
          [
            logItem({ id: 1 }),
            logItem({ id: 2, client_name: "", client_version: "", user_agent: "" }),
          ],
          { capabilities: { requestLogClients: true }, filters: clientFacet },
        ),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();

      expect(within(grid).getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();
      const client = await within(grid).findByText("Codex CLI");
      expect(within(grid).getByText("0.125.0")).toBeInTheDocument();
      expect(await tooltipOf(user, client)).toContain(
        "codex_cli_rs/0.125.0 (Mac OS 26.1.0; arm64) Apple_Terminal/464",
      );
      // A request without a User-Agent reads as unknown, not as a blank cell.
      expect(within(grid).getByText("Unknown")).toBeInTheDocument();
    });

    test("its facet lists clients by count and filters by the normalised name", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(
        logsAnswer([logItem()], {
          capabilities: { requestLogClients: true },
          filters: clientFacet,
        }),
      );
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("Codex CLI");

      const dialog = await chooseInFacet(user, "Agent", [], { apply: false });
      const options = within(dialog).getAllByRole("checkbox");
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveAccessibleName(/Claude Code.*9/);
      expect(options[1]).toHaveAccessibleName(/Codex CLI.*5/);
      expect(options[2]).toHaveAccessibleName(/Unknown.*1/);
      await user.click(options[1]);
      await user.click(within(dialog).getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(lastQuery().client_names).toEqual(["codex-cli"]));
    });

    test("a backend without the caller fields gets no Agent column, no facet and no client filter", async () => {
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([legacyItem()], { filters: secretFacet }));
      renderRequestLogsPage();
      const grid = await findLogGrid();
      await within(grid).findByText("Primary");
      await waitFor(() =>
        expect(within(grid).queryByRole("columnheader", { name: "Agent" })).toBeNull(),
      );
      expect(
        within(screen.getByRole("search")).queryByRole("button", { name: /^Agent/ }),
      ).toBeNull();
      expect(lastQuery().client_names).toBeUndefined();
    });

    test("holds its place until support is known, then goes away on an older backend", async () => {
      const first = deferred<UsageLogsResponse>();
      mocks.getUsageLogs.mockReturnValueOnce(first.promise);
      renderRequestLogsPage();
      const grid = await findLogGrid();
      // Unknown yet: the column is a placeholder so it keeps its position in the order.
      expect(within(grid).getByRole("columnheader", { name: "Agent" })).toBeInTheDocument();

      first.resolve(logsAnswer([legacyItem()], { filters: secretFacet }));
      await within(grid).findByText("Primary");
      await waitFor(() =>
        expect(within(grid).queryByRole("columnheader", { name: "Agent" })).toBeNull(),
      );
    });

    test("the configuration's declaration offers the facet before the first page is back", async () => {
      mocks.getConfig.mockResolvedValue({ capabilities: { "request-log-clients": true } });
      mocks.getUsageLogs.mockReturnValue(new Promise(() => {}));
      renderRequestLogsPage();
      await waitFor(() => expect(facetButton("Agent")).toBeInTheDocument());
    });
  });

  test("time and status are pinned, and a row opens its full detail", async () => {
    const user = userEvent.setup();
    mocks.getUsageLogs.mockResolvedValue(
      logsAnswer([logItem({ id: 4242 })], { capabilities: { requestLogClients: true } }),
    );
    const { container } = renderRequestLogsPage();
    const grid = await findLogGrid();
    await within(grid).findByText("Primary");

    expect(container.querySelector('th[data-col="time"]')).toHaveAttribute("data-pin", "start");
    expect(container.querySelector('th[data-col="status"]')).toHaveAttribute("data-pin", "end");

    await user.click(within(grid).getByRole("button", { name: "Show details" }));
    const detail = await waitFor(() => {
      const node = container.querySelector("[data-grid-detail]");
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(detail).toHaveTextContent("#4242");
    expect(detail).toHaveTextContent("codex_cli_rs/0.125.0");
  });

  describe("clearing database logs", () => {
    test("clears bulky request-log content by default while preserving request rows", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs
        .mockResolvedValueOnce(logsAnswer([logItem({ has_content: true })]))
        .mockResolvedValueOnce(logsAnswer([logItem({ has_content: false })]));
      mocks.clearUsageLogs.mockResolvedValue({ deleted_logs: 0, deleted_contents: 1 });
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("Primary");

      await user.click(screen.getByRole("button", { name: "Clear Database Logs" }));
      await user.click(await screen.findByRole("button", { name: "Clear Selected Data" }));

      await waitFor(() => expect(mocks.clearUsageLogs).toHaveBeenCalledTimes(1));
      expect(mocks.clearUsageLogs).toHaveBeenCalledWith({
        clear_body_content: true,
        clear_detail_content: true,
        clear_request_records: false,
      });
      expect(await within(await findLogGrid()).findByText("Primary")).toBeInTheDocument();
    });

    test("keeps the clear dialog open until cleanup and refresh both finish", async () => {
      const user = userEvent.setup();
      const cleanup = deferred<{ deleted_logs: number; deleted_contents: number }>();
      const refresh = deferred<UsageLogsResponse>();
      mocks.getUsageLogs
        .mockResolvedValueOnce(logsAnswer([]))
        .mockImplementationOnce(() => refresh.promise);
      mocks.clearUsageLogs.mockImplementationOnce(() => cleanup.promise);
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("No request logs yet");

      await user.click(screen.getByRole("button", { name: "Clear Database Logs" }));
      await user.click(await screen.findByRole("button", { name: "Clear Selected Data" }));
      cleanup.resolve({ deleted_logs: 0, deleted_contents: 1 });

      await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      expect(screen.getByRole("dialog", { name: "Clear database logs?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear Selected Data" })).toBeDisabled();

      refresh.resolve(logsAnswer([]));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Clear database logs?" })).toBeNull(),
      );
    });

    test("explains the cleanup scope, locks content options behind records and needs one option", async () => {
      const user = userEvent.setup();
      mocks.getUsageLogs.mockResolvedValue(logsAnswer([]));
      mocks.clearUsageLogs.mockResolvedValue({ deleted_logs: 3, deleted_contents: 3 });
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("No request logs yet");

      await user.click(screen.getByRole("button", { name: "Clear Database Logs" }));
      const dialog = await screen.findByRole("dialog", { name: "Clear database logs?" });
      expect(
        within(dialog).getByText("All request logs in the current tenant"),
      ).toBeInTheDocument();
      expect(within(dialog).getByText(/Not limited by the current filters/)).toBeInTheDocument();
      expect(within(dialog).getByText(/request records and stats stay/)).toBeInTheDocument();

      const body = within(dialog).getByRole("checkbox", { name: /Clear request\/response bodies/ });
      const details = within(dialog).getByRole("checkbox", {
        name: /Clear request detail payloads/,
      });
      const records = within(dialog).getByRole("checkbox", { name: /Clear request records/ });
      const confirm = within(dialog).getByRole("button", { name: "Clear Selected Data" });

      await user.click(body);
      await user.click(details);
      expect(confirm).toBeDisabled();

      await user.click(records);
      expect(body).toBeChecked();
      expect(details).toBeChecked();
      expect(body).toBeDisabled();
      expect(within(dialog).getByText(/Request records are deleted too/)).toBeInTheDocument();
      expect(confirm).toBeEnabled();

      await user.click(confirm);
      await waitFor(() =>
        expect(mocks.clearUsageLogs).toHaveBeenCalledWith({
          clear_body_content: true,
          clear_detail_content: true,
          clear_request_records: true,
        }),
      );
    });
  });
});
