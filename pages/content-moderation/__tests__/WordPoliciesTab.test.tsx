import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, type WordRule } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";
import { WITH_WORD_GUARD, allNew, wordOverview, wordRule, wordView } from "./wordFixtures";

const mocks = vi.hoisted(() => ({
  profiles: {
    getMetrics: vi.fn(),
    listProfiles: vi.fn(),
    createProfile: vi.fn(),
    patchProfile: vi.fn(),
    deleteProfile: vi.fn(),
    testProfile: vi.fn(),
    listChannels: vi.fn(),
    patchBindings: vi.fn(),
  },
  words: {
    overview: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
    validate: vi.fn(),
    test: vi.fn(),
    portal: vi.fn(),
    setPortalDefault: vi.fn(),
    setPortalUser: vi.fn(),
  },
  keys: { list: vi.fn() },
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  contentModerationApi: mocks.profiles,
  wordPolicyApi: mocks.words,
  apiKeyEntriesApi: mocks.keys,
}));

const tenantRules = [wordRule("r1", "alpha", { note: "first" }), wordRule("r2", "\\d{11}", { kind: "regex" })];

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ContentModerationPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

/** 敏感词是页面默认打开的标签，进来就是本租户规则。 */
const ruleTable = () => screen.findByRole("table", { name: "Sensitive-word rule table" });
const rail = () => screen.getByRole("navigation", { name: "Rule sets" });
const saveBar = () => screen.queryByRole("region", { name: "Unsaved changes" });

const refusal = (rules: Array<Record<string, unknown>>) =>
  new ApiError({
    message: "word policy is invalid",
    status: 422,
    payload: { error: { code: "word_policy_invalid", message: "word policy is invalid", rules_total: rules.length, rules } },
  });

describe("sensitive words tab", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async (scope: string, id?: string) => {
      if (scope === "platform") return wordView("platform", { can_edit: false, rules: [wordRule("p1", "forbidden")] });
      if (scope === "key") return wordView("key", { scope_id: id, rules: [] });
      return wordView("tenant", { rules: tenantRules });
    });
    // Like the server: stored rules keep their id, a new rule is given one.
    mocks.words.put.mockImplementation(
      async (_scope: string, input: { rules: Array<Partial<WordRule> & Pick<WordRule, "kind" | "pattern" | "enabled">> }) =>
        wordView("tenant", {
          version: 4,
          rules: input.rules.map((rule, index) => ({ ...rule, id: rule.id ?? `new-id-${index}` })),
        }),
    );
    mocks.words.validate.mockResolvedValue(allNew(1));
    mocks.words.remove.mockResolvedValue(undefined);
    mocks.keys.list.mockResolvedValue([
      { id: "k1", name: "Team A", key: "sk-abcdefghijklXXXXmnop" },
      { id: "k2", name: "Team B", key: "sk-zyxwvutsrqpoXXXXnm" },
    ]);
  });

  test("a backend that does not declare word_guard shows no such tab and is never asked", async () => {
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: { ...WITH_WORD_GUARD, wordGuard: false } });
    renderPage();

    expect(await screen.findByText("No moderation profiles")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensitive words" })).not.toBeInTheDocument();
    expect(mocks.words.overview).not.toHaveBeenCalled();
    expect(mocks.words.get).not.toHaveBeenCalled();
  });

  test("opens on the tenant's words: the list, its counts and what is in force", async () => {
    renderPage();
    const table = await ruleTable();

    expect(screen.getByRole("tab", { name: "Sensitive words" })).toHaveAttribute("aria-selected", "true");
    expect(within(rail()).getByRole("button", { name: /Tenant rules/ })).toHaveAttribute("aria-current", "true");
    expect(within(table).getByText("alpha")).toBeInTheDocument();
    expect(within(table).getByText("\\d{11}")).toBeInTheDocument();
    expect(within(table).getByText("first")).toBeInTheDocument();
    expect(screen.getByText(/Rules: 2 of 10000 · Regular expressions: 1 of 50/)).toBeInTheDocument();
    expect(screen.getByTestId("word-policy-status")).toHaveTextContent("Words checked: 2");
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeChecked();
    // Nothing is changed yet, so there is nothing to save.
    expect(saveBar()).not.toBeInTheDocument();
    expect(mocks.words.get).toHaveBeenCalledWith("tenant", undefined);
  });

  test("adds several words at once and saves the whole policy with the version it read", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    const input = screen.getByRole("textbox", { name: "Add sensitive words" });
    await user.type(input, "gamma, ALPHA{Shift>}{Enter}{/Shift}delta{Enter}");
    // alpha is already in the list (case does not matter); the other two are added.
    expect(await screen.findByText("Added: 2 · Already in the list, skipped: 1")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.getByTestId("word-policy-status")).toHaveTextContent("Words: 4 · applied once saved");
    // Typed words are not checked with the server one by one: the save checks them all.
    expect(mocks.words.validate).not.toHaveBeenCalled();

    const bar = saveBar();
    expect(bar).not.toBeNull();
    await user.click(within(bar!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
    const [scope, body, id] = mocks.words.put.mock.calls[0];
    expect(scope).toBe("tenant");
    expect(id).toBeUndefined();
    expect(body).toMatchObject({ version: 3, enabled: true, action: "block", scan_scope: "all_user" });
    // The new words have no id yet (the server gives them one); stored rules keep theirs.
    expect(body.rules).toEqual([
      { kind: "keyword", pattern: "gamma", enabled: true },
      { kind: "keyword", pattern: "delta", enabled: true },
      { id: "r1", kind: "keyword", pattern: "alpha", enabled: true, note: "first" },
      { id: "r2", kind: "regex", pattern: "\\d{11}", enabled: true },
    ]);
    expect(await screen.findByText("Sensitive-word rules saved")).toBeInTheDocument();
    await waitFor(() => expect(saveBar()).not.toBeInTheDocument());
  });

  test("a word longer than a keyword may be is kept in the box and explained", async () => {
    const user = userEvent.setup();
    mocks.words.overview.mockResolvedValue(wordOverview({ limits: { ...wordOverview().limits, max_keyword_chars: 4 } }));
    renderPage();
    await ruleTable();

    const input = screen.getByRole("textbox", { name: "Add sensitive words" });
    await user.type(input, "toolong{Enter}");
    expect(await screen.findByText("Longer than 4 characters, skipped: 1")).toBeInTheDocument();
    expect(input).toHaveValue("toolong");
    expect(saveBar()).not.toBeInTheDocument();
  });

  test("a regular expression goes through the dialog, which asks the server and names its reason", async () => {
    const user = userEvent.setup();
    mocks.words.validate.mockResolvedValue({
      summary: { ...allNew(1).summary, new: 0, invalid: 1 },
      reviews: [
        {
          index: 0,
          status: "invalid",
          problem: { index: 0, kind: "regex", pattern: "(", code: "invalid_regex", message: "missing closing ): `(`" },
        },
      ],
    });
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("button", { name: "Regular expression" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    expect(within(dialog).getByRole("radio", { name: "Regular expression" })).toBeChecked();
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "(");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    expect(await within(dialog).findByText("missing closing ): `(`")).toBeInTheDocument();
    expect(mocks.words.validate).toHaveBeenCalledWith({ scope: "tenant", rules: [{ kind: "regex", pattern: "(" }] });
    expect(saveBar()).not.toBeInTheDocument();
  });

  test("the dialog's button is the submit button of its form, so Enter in the field adds the rule", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("button", { name: "Regular expression" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    const form = dialog.querySelector("form");
    const button = within(dialog).getByRole("button", { name: "Add rule" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("form", form!.id);
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "\\bdelta\\b");
    fireEvent.submit(form!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add rule" })).not.toBeInTheDocument());
    expect(await screen.findByText("\\bdelta\\b")).toBeInTheDocument();
  });

  test("a rule that is already in the list is turned down in the dialog without asking the server", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("button", { name: "Regular expression" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "\\d{{11}");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
    expect(await within(dialog).findByText("This rule is already in the list.")).toBeInTheDocument();
    expect(mocks.words.validate).not.toHaveBeenCalled();
  });

  test("imports a word list: checks it first, then adds only the new rules to the draft", async () => {
    const user = userEvent.setup();
    mocks.words.validate.mockResolvedValue({
      summary: { ...allNew(3).summary, new: 1, existing: 1, invalid: 1 },
      reviews: [
        { index: 0, status: "existing", existing_id: "r1" },
        {
          index: 2,
          status: "invalid",
          problem: { index: 2, kind: "keyword", pattern: "​", code: "empty", message: "the keyword has no visible characters" },
        },
      ],
    });
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("button", { name: "Import file" }));
    const dialog = await screen.findByRole("dialog", { name: "Import rules from a file" });
    const file = new File(["alpha\r\nnewone\r\n​\r\n"], "words.txt", { type: "text/plain" });
    await user.upload(within(dialog).getByTestId("word-import-file"), file);
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Entries" })).toHaveValue("alpha\nnewone\n​\n"),
    );
    await user.click(within(dialog).getByRole("button", { name: "Check" }));
    await waitFor(() =>
      expect(mocks.words.validate).toHaveBeenCalledWith({
        scope: "tenant",
        rules: [
          { kind: "keyword", pattern: "alpha" },
          { kind: "keyword", pattern: "newone" },
          { kind: "keyword", pattern: "​" },
        ],
      }),
    );
    const result = await within(dialog).findByRole("region", { name: "Import check result" });
    expect(result).toHaveTextContent("New1Repeated or present1Invalid1Lines3");
    await user.click(within(dialog).getByRole("button", { name: "Add to list (1)" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import rules from a file" })).not.toBeInTheDocument());
    expect(await screen.findByText("newone")).toBeInTheDocument();
    expect(mocks.words.put).not.toHaveBeenCalled();
  });

  test("a save the server refuses names the rule and marks its row", async () => {
    const user = userEvent.setup();
    mocks.words.put.mockRejectedValue(
      refusal([{ index: 1, id: "r2", kind: "regex", pattern: "\\d{11}", code: "matches_empty", message: "the expression can match the empty string" }]),
    );
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(within(saveBar()!).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Rules that could not be saved: 1")).toBeInTheDocument();
    // Once in the summary, once on the row of the rule it is about.
    expect(await screen.findAllByText(/the expression can match the empty string/)).toHaveLength(2);
    // The draft is kept, so the user can fix the rule and try again.
    expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();
  });

  test("a save that lost to someone else's offers to reload instead of overwriting", async () => {
    const user = userEvent.setup();
    mocks.words.put.mockRejectedValue(
      new ApiError({ message: "conflict", status: 409, payload: { error: { code: "word_policy_version_conflict", message: "changed" } } }),
    );
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(within(saveBar()!).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Changed elsewhere")).toBeInTheDocument();
    const loadsBefore = mocks.words.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(mocks.words.get.mock.calls.length).toBe(loadsBefore + 1));
    expect(await screen.findByRole("switch", { name: "Toggle rule alpha" })).toBeChecked();
  });

  test("the platform's rules are read-only for a tenant", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(within(rail()).getByRole("button", { name: /Platform rules/ }));
    expect(await screen.findByText(/set by the platform operator/)).toBeInTheDocument();
    expect(screen.getByText("forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add sensitive words" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove policy" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeDisabled();
  });

  test("choosing to replace asks for the replacement and says what replace cannot do", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();
    await user.click(screen.getByRole("tab", { name: /On match/ }));
    expect(screen.queryByText(/Replayed thinking blocks are signed/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Block message/ })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Replace the text/ }));
    expect(await screen.findByRole("textbox", { name: /Replacement text/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Block message/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Replayed thinking blocks are signed/)).toBeInTheDocument();
    // Object keys and tool-call arguments are rewritten now; the note must not claim they are refused.
    expect(screen.queryByText(/object key/i)).not.toBeInTheDocument();
  });

  test("leaving a rule set with unsaved changes asks first", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(within(rail()).getByRole("button", { name: /Platform rules/ }));
    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    // Still on the tenant's rules, with the edit intact.
    expect(within(rail()).getByRole("button", { name: /Tenant rules/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();

    await user.click(within(rail()).getByRole("button", { name: /Platform rules/ }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).getByRole("button", { name: "Discard and switch" }),
    );
    expect(await screen.findByText("forbidden")).toBeInTheDocument();
    expect(within(rail()).getByRole("button", { name: /Platform rules/ })).toHaveAttribute("aria-current", "true");
  });

  test("leaving for another tab of the page with unsaved changes asks first", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));
    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();
  });

  test("removing a saved policy asks first, then deletes it and reloads the empty one", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(screen.getByRole("button", { name: "Remove policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Tenant rules?" });
    expect(mocks.words.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mocks.words.remove).toHaveBeenCalledWith("tenant", undefined));
    expect(await screen.findByText("Policy removed")).toBeInTheDocument();
  });
});

describe("sensitive words of one API key", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async (scope: string, id?: string) =>
      scope === "key" ? wordView("key", { scope_id: id, rules: [] }) : wordView("tenant", { rules: tenantRules }),
    );
    mocks.words.put.mockImplementation(async (_scope: string, input: Record<string, unknown>) =>
      wordView("key", { ...(input as object), version: 4 }),
    );
    mocks.keys.list.mockResolvedValue([{ id: "k1", name: "Team A", key: "sk-abcdefghijklXXXXmnop" }]);
  });

  test("asks for a key first, then follows the tenant until told otherwise", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(within(rail()).getByRole("button", { name: /API key rules/ }));
    expect(await screen.findByText("Pick a key to see or set the rules that apply only to its requests.")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "API key" }));
    await user.click(await screen.findByRole("option", { name: /Team A/ }));
    await waitFor(() => expect(mocks.words.get).toHaveBeenCalledWith("key", "k1"));

    // A key follows the tenant's handling until it picks its own; the tab says so before it is opened.
    await user.click(await screen.findByRole("tab", { name: /On match Follow the tenant/ }));
    expect(await screen.findByRole("radio", { name: /Follow the tenant/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /Advanced options/ }));
    expect(screen.getByRole("switch", { name: "Also apply the tenant's rules" })).toBeChecked();

    await user.click(screen.getByRole("tab", { name: /^Words/ }));
    await user.type(screen.getByRole("textbox", { name: "Add sensitive words" }), "keyword{Enter}");
    await user.click(within(saveBar()!).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
    const [scope, body, id] = mocks.words.put.mock.calls[0];
    expect([scope, id]).toEqual(["key", "k1"]);
    // Nothing the user did not choose is pinned: the handling still follows the tenant.
    expect(body).toMatchObject({ action: "", scan_scope: "", reply_filter: null, inherit_tenant: true });
  });
});

describe("portal accounts' own words", () => {
  const users = [
    {
      id: "u1",
      username: "alice",
      display_name: "Alice",
      status: "active",
      override: null,
      allowed: false,
      policy: { scope_type: "end_user" as const, scope_id: "u1", enabled: true, action: "" as const, scan_scope: "" as const, reply_filter: null, rule_count: 2, version: 1 },
    },
    { id: "u2", username: "bob", display_name: "", status: "active", override: null, allowed: false, policy: null },
  ];

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: { ...WITH_WORD_GUARD, wordPortal: true } });
    mocks.words.overview.mockResolvedValue(wordOverview({ portal: { default_allowed: false, policies: 1, active_policies: 0 } }));
    mocks.words.get.mockImplementation(async (scope: string, id?: string) =>
      scope === "end_user"
        ? wordView("end_user", { scope_id: id, rules: [wordRule("e1", "rival")], end_user_name: "Alice", end_user_allowed: false })
        : wordView("tenant", { rules: tenantRules }),
    );
    mocks.words.portal.mockResolvedValue({ default_allowed: false, limits: { ...wordOverview().limits, max_rules: 1000 }, users });
    mocks.words.setPortalDefault.mockResolvedValue({ default_allowed: true });
    mocks.words.setPortalUser.mockImplementation(async (id: string, allowed: boolean | null) => ({ id, override: allowed, allowed: allowed === true }));
  });

  test("is not offered by a backend that does not declare word_portal", async () => {
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    renderPage();
    await ruleTable();
    expect(within(rail()).queryByRole("button", { name: /Portal accounts/ })).not.toBeInTheDocument();
    expect(mocks.words.portal).not.toHaveBeenCalled();
  });

  test("opens them to every portal account, or allows and denies one account", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(within(rail()).getByRole("button", { name: /Portal accounts/ }));
    expect(await screen.findByRole("heading", { name: "Portal accounts' own sensitive words" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Allow all portal accounts" }));
    await waitFor(() => expect(mocks.words.setPortalDefault).toHaveBeenCalledWith(true));

    await user.click(screen.getByRole("combobox", { name: "Permission of bob" }));
    await user.click(await screen.findByRole("option", { name: "Allow" }));
    await waitFor(() => expect(mocks.words.setPortalUser).toHaveBeenCalledWith("u2", true));
  });

  test("shows an account's words, and says when they do not apply", async () => {
    const user = userEvent.setup();
    renderPage();
    await ruleTable();

    await user.click(within(rail()).getByRole("button", { name: /Portal accounts/ }));
    const row = (await screen.findByText("Alice")).closest("tr")!;
    expect(within(row).getByText("Words: 2")).toBeInTheDocument();
    expect(within(row).getByText("Not allowed, not applied")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "View words" }));

    await waitFor(() => expect(mocks.words.get).toHaveBeenCalledWith("end_user", "u1"));
    expect(await screen.findByRole("heading", { name: "Sensitive words of Alice" })).toBeInTheDocument();
    expect(screen.getByText("rival")).toBeInTheDocument();
    expect(screen.getByText(/may not keep sensitive words of its own right now/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to portal accounts" }));
    expect(await screen.findByRole("heading", { name: "Portal accounts' own sensitive words" })).toBeInTheDocument();
  });
});
