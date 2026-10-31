import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, type WordRule } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";
import {
  WITH_WORD_GUARD,
  allNew,
  wordOverview,
  wordRule,
  wordView,
} from "./wordFixtures";

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

async function openWordRules(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("tab", { name: "Sensitive words" }));
  return screen.findByRole("table", { name: "Sensitive-word rule table" });
}

const refusal = (rules: Array<Record<string, unknown>>) =>
  new ApiError({
    message: "word policy is invalid",
    status: 422,
    payload: {
      error: {
        code: "word_policy_invalid",
        message: "word policy is invalid",
        rules_total: rules.length,
        rules,
      },
    },
  });

describe("sensitive-word rules tab", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async (scope: string, keyId?: string) => {
      if (scope === "platform") {
        return wordView("platform", { can_edit: false, rules: [wordRule("p1", "forbidden")] });
      }
      if (scope === "key") return wordView("key", { scope_id: keyId, rules: [] });
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
    mocks.profiles.listProfiles.mockResolvedValue({
      items: [],
      capabilities: { ...WITH_WORD_GUARD, wordGuard: false },
    });
    renderPage();

    expect(await screen.findByText("No moderation profiles")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Sensitive words" })).not.toBeInTheDocument();
    expect(mocks.words.overview).not.toHaveBeenCalled();
    expect(mocks.words.get).not.toHaveBeenCalled();
  });

  test("shows the tenant policy: its settings, counts and rules", async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await openWordRules(user);

    expect(within(table).getByText("alpha")).toBeInTheDocument();
    expect(within(table).getByText("\\d{11}")).toBeInTheDocument();
    expect(within(table).getByText("first")).toBeInTheDocument();
    expect(screen.getByText(/Rules: 2 of 10000 · Regular expressions: 1 of 50/)).toBeInTheDocument();
    expect(screen.getByText("Saved · version 3")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeChecked();
    // Nothing is changed yet, so there is nothing to save.
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(mocks.words.get).toHaveBeenCalledWith("tenant", "");
  });

  test("adds a rule through the dialog and saves the whole policy with the version it read", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "gamma");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add rule" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("gamma")).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
    const [scope, input, keyId] = mocks.words.put.mock.calls[0];
    expect(scope).toBe("tenant");
    expect(keyId).toBeUndefined();
    expect(input).toMatchObject({ version: 3, enabled: true, action: "block", scan_scope: "all_user" });
    // The new rule has no id yet (the server gives it one); stored rules keep theirs.
    expect(input.rules).toEqual([
      { kind: "keyword", pattern: "gamma", enabled: true },
      { id: "r1", kind: "keyword", pattern: "alpha", enabled: true, note: "first" },
      { id: "r2", kind: "regex", pattern: "\\d{11}", enabled: true },
    ]);
    expect(await screen.findByText("Sensitive-word rules saved")).toBeInTheDocument();
    expect(screen.getByText("Saved · version 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("the dialog's button is the submit button of its form, so Enter in the field adds the rule", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    const form = dialog.querySelector("form");
    expect(form).not.toBeNull();
    // The button sits in the dialog's footer, outside the form. A browser submits a
    // form on Enter by clicking its default button, which is found through this
    // association (jsdom's keyboard simulation does not follow it, so the submit
    // itself is fired directly below).
    const button = within(dialog).getByRole("button", { name: "Add rule" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("form", form!.id);

    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "delta");
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Add rule" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("delta")).toBeInTheDocument();
    expect(mocks.words.validate).toHaveBeenCalledTimes(1);
  });

  test("an invalid regular expression is refused in the dialog with the server's reason", async () => {
    const user = userEvent.setup();
    mocks.words.validate.mockResolvedValue({
      summary: { ...allNew(1).summary, new: 0, invalid: 1 },
      reviews: [
        {
          index: 0,
          status: "invalid",
          problem: {
            index: 0,
            kind: "regex",
            pattern: "(",
            code: "invalid_regex",
            message: "missing closing ): `(`",
          },
        },
      ],
    });
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    await user.click(within(dialog).getByRole("radio", { name: "Regular expression" }));
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "(");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    expect(await within(dialog).findByText("missing closing ): `(`")).toBeInTheDocument();
    expect(mocks.words.validate).toHaveBeenCalledWith({
      scope: "tenant",
      rules: [{ kind: "regex", pattern: "(" }],
    });
    // The rule was not added and nothing became savable.
    expect(screen.getByRole("dialog", { name: "Add rule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("a rule that is already in the list is turned down without asking the server", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    const dialog = await screen.findByRole("dialog", { name: "Add rule" });
    await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "  ALPHA ");
    await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

    expect(
      await within(dialog).findByText("This rule is already in the list."),
    ).toBeInTheDocument();
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
          problem: {
            index: 2,
            kind: "keyword",
            pattern: "\u200b",
            code: "empty",
            message: "the keyword has no visible characters",
          },
        },
      ],
    });
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Import file" }));
    const dialog = await screen.findByRole("dialog", { name: "Import rules from a file" });
    const file = new File(["alpha\r\nnewone\r\n\u200b\r\n"], "words.txt", { type: "text/plain" });
    await user.upload(within(dialog).getByTestId("word-import-file"), file);
    await waitFor(() =>
      // A textarea normalises line breaks to \n; the parser accepts both.
      expect(within(dialog).getByRole("textbox", { name: "Entries" })).toHaveValue(
        "alpha\nnewone\n\u200b\n",
      ),
    );
    expect(within(dialog).getByText(/Loaded from words\.txt/)).toBeInTheDocument();

    // Nothing can be imported before the list has been checked.
    expect(within(dialog).getByRole("button", { name: "Add to list (0)" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Check" }));

    await waitFor(() =>
      expect(mocks.words.validate).toHaveBeenCalledWith({
        scope: "tenant",
        rules: [
          { kind: "keyword", pattern: "alpha" },
          { kind: "keyword", pattern: "newone" },
          { kind: "keyword", pattern: "\u200b" },
        ],
      }),
    );
    const result = await within(dialog).findByRole("region", { name: "Import check result" });
    expect(result).toHaveTextContent("New1Repeated or present1Invalid1Lines3");
    // The invalid line is named by its line number in the file, with the server's reason.
    expect(within(result).getByText("the keyword has no visible characters")).toBeInTheDocument();
    expect(within(result).getByRole("cell", { name: "3" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Add to list (1)" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Import rules from a file" })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("newone")).toBeInTheDocument();
    // Imported rules are only in the draft until it is saved.
    expect(mocks.words.put).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
    expect(mocks.words.put.mock.calls[0][1].rules.map((rule: { pattern: string }) => rule.pattern)).toEqual([
      "newone",
      "alpha",
      "\\d{11}",
    ]);
  });

  test("an import that would not fit under the limits cannot be added", async () => {
    const user = userEvent.setup();
    mocks.words.overview.mockResolvedValue(
      wordOverview({ limits: { ...wordOverview().limits, max_rules: 3 } }),
    );
    mocks.words.validate.mockResolvedValue(allNew(2));
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Import file" }));
    const dialog = await screen.findByRole("dialog", { name: "Import rules from a file" });
    await user.type(within(dialog).getByRole("textbox", { name: "Entries" }), "one{Enter}two");
    await user.click(within(dialog).getByRole("button", { name: "Check" }));

    // Two rules are already in the draft; two more make four, and the limit is three.
    expect(await within(dialog).findByText(/would make 4 rules \(up to 3\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add to list (2)" })).toBeDisabled();
  });

  test("a save the server refuses names the rule and marks its row", async () => {
    const user = userEvent.setup();
    mocks.words.put.mockRejectedValue(
      refusal([
        {
          index: 1,
          id: "r2",
          kind: "regex",
          pattern: "\\d{11}",
          code: "matches_empty",
          message: "the expression can match the empty string",
        },
      ]),
    );
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Rules that could not be saved: 1")).toBeInTheDocument();
    const alerts = await screen.findAllByText(/the expression can match the empty string/);
    // Once in the summary, once on the row of the rule it is about.
    expect(alerts).toHaveLength(2);
    // The draft is kept, so the user can fix the rule and try again.
    expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();
  });

  test("a save that lost to someone else's offers to reload instead of overwriting", async () => {
    const user = userEvent.setup();
    mocks.words.put.mockRejectedValue(
      new ApiError({
        message: "conflict",
        status: 409,
        payload: { error: { code: "word_policy_version_conflict", message: "changed" } },
      }),
    );
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Changed elsewhere")).toBeInTheDocument();
    const loadsBefore = mocks.words.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Reload" }));

    await waitFor(() => expect(mocks.words.get.mock.calls.length).toBe(loadsBefore + 1));
    await waitFor(() => expect(screen.queryByText("Changed elsewhere")).not.toBeInTheDocument());
    expect(await screen.findByRole("switch", { name: "Toggle rule alpha" })).toBeChecked();
  });

  test("the platform policy is read-only for a tenant", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("radio", { name: "Platform" }));

    expect(await screen.findByText(/set by the platform operator/)).toBeInTheDocument();
    expect(screen.getByText("forbidden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove policy" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Toggle rule forbidden" })).toBeDisabled();
  });

  test("an API key override shows what each setting inherits and saves them as inherited", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("radio", { name: "API key" }));
    expect(await screen.findByText("Pick a key to see or set the rules that apply only to its requests.")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "API key" }));
    await user.click(await screen.findByRole("option", { name: /Team A/ }));

    await waitFor(() => expect(mocks.words.get).toHaveBeenCalledWith("key", "k1"));
    // The tenant's value is written on the option, so "inherit" is not a guess.
    const action = await screen.findByRole("combobox", { name: "When a rule matches" });
    expect(action).toHaveTextContent("Inherit (Block the request)");
    expect(screen.getByRole("combobox", { name: "Filter model replies" })).toHaveTextContent(
      "Inherit (Off)",
    );

    // Adjusting one setting leaves the others inherited.
    await user.click(action);
    await user.click(await screen.findByRole("option", { name: "Log only" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
    const [scope, input, keyId] = mocks.words.put.mock.calls[0];
    expect(scope).toBe("key");
    expect(keyId).toBe("k1");
    expect(input).toMatchObject({
      action: "log",
      scan_scope: "",
      reply_filter: null,
      fold_traditional_chinese: null,
      inherit_tenant: true,
    });
  });

  test("choosing to replace says what replace cannot do, and block does not", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);
    expect(screen.queryByText(/Replayed thinking blocks are signed/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "When a rule matches" }));
    await user.click(await screen.findByRole("option", { name: "Replace the text" }));

    expect(
      await screen.findByText(
        /text that is not valid UTF-8, or JSON nested too deeply\) blocks the request instead, and the refusal names the field\. Replayed thinking blocks are signed/i,
      ),
    ).toBeInTheDocument();
    // Object keys and tool-call arguments are rewritten now; the note must not claim they are refused.
    expect(screen.queryByText(/object key/i)).not.toBeInTheDocument();
  });

  test("leaving a layer with unsaved changes asks first", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
    await user.click(screen.getByRole("radio", { name: "Platform" }));

    const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    // Still on the tenant layer, with the edit intact.
    expect(screen.getByRole("radio", { name: "This tenant" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Platform" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).getByRole(
        "button",
        { name: "Discard and switch" },
      ),
    );
    expect(await screen.findByText("forbidden")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Platform" })).toBeChecked();
  });

  test("removing a saved policy asks first, then deletes it and reloads the empty one", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("button", { name: "Remove policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove the This tenant policy?" });
    expect(mocks.words.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(mocks.words.remove).toHaveBeenCalledWith("tenant", undefined));
    expect(await screen.findByText("Policy removed")).toBeInTheDocument();
  });
});
