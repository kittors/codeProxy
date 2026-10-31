import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { WordRule } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";
import { WITH_WORD_GUARD, allNew, wordOverview, wordRule, wordView } from "./wordFixtures";

/**
 * The rule list and its dialogs: keywords that ignore the separators between their characters, a
 * platform word list the tenant may not read, and the notes about what a streamed reply can miss.
 */

const mocks = vi.hoisted(() => ({
  profiles: { listProfiles: vi.fn() },
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

const IGNORE = "Ignore spaces and punctuation between characters";

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

type User = ReturnType<typeof userEvent.setup>;

async function openAddDialog(user: User) {
  await user.click(screen.getByRole("button", { name: "Add rule" }));
  return screen.findByRole("dialog", { name: "Add rule" });
}

describe("sensitive-word rules: keywords that ignore separators", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async () =>
      wordView("tenant", { rules: [wordRule("r1", "alpha"), wordRule("r2", "\\d{11}", { kind: "regex" })] }),
    );
    mocks.words.put.mockImplementation(async (_scope: string, input: { rules: WordRule[] }) =>
      wordView("tenant", {
        version: 4,
        rules: input.rules.map((rule, index) => ({ ...rule, id: rule.id ?? `new-${index}` })),
      }),
    );
    mocks.words.validate.mockResolvedValue(allNew(1));
    mocks.keys.list.mockResolvedValue([]);
  });

  describe("in the rule dialog", () => {
    test("is offered for keywords only, off to begin with, and cleared by trying another type", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openAddDialog(user);

      const option = () => within(dialog).queryByRole("checkbox", { name: IGNORE });
      expect(option()).not.toBeChecked();

      await user.click(option()!);
      expect(option()).toBeChecked();

      await user.click(within(dialog).getByRole("radio", { name: "Regular expression" }));
      // A regular expression says what it means itself; it has no such option.
      expect(option()).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("radio", { name: "Keyword" }));
      expect(option()).not.toBeChecked();
    });

    test("says what it does, so nobody has to guess at it", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openAddDialog(user);

      expect(within(dialog).getByText(/“cat” also matches “pic at”/)).toBeInTheDocument();
      // And the hint on the field no longer claims that spacing is skipped by itself.
      expect(within(dialog).getByText(/Spaces or punctuation between the characters of the text are not skipped/)).toBeInTheDocument();
      expect(within(dialog).queryByText(/ignoring case, full-width forms, spacing/)).not.toBeInTheDocument();
    });

    test("a keyword added with it is checked, listed and saved with it", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openAddDialog(user);

      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "敏感词");
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

      await waitFor(() =>
        expect(mocks.words.validate).toHaveBeenCalledWith({
          scope: "tenant",
          rules: [{ kind: "keyword", pattern: "敏感词", ignore_separators: true }],
        }),
      );
      const row = (await screen.findByText("敏感词")).closest("tr")!;
      expect(within(row).getByText("Ignores separators")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      expect(mocks.words.put.mock.calls[0][1].rules[0]).toEqual({
        kind: "keyword",
        pattern: "敏感词",
        enabled: true,
        ignore_separators: true,
      });
    });

    test("a keyword without it is checked and saved without the field", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openAddDialog(user);

      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "gamma");
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

      await waitFor(() =>
        expect(mocks.words.validate).toHaveBeenCalledWith({
          scope: "tenant",
          rules: [{ kind: "keyword", pattern: "gamma" }],
        }),
      );
      await screen.findByText("gamma");
      expect(screen.queryByText("Ignores separators")).not.toBeInTheDocument();
    });

    test("can be turned on for a rule that is already in the list, which makes the draft unsaved", async () => {
      const user = userEvent.setup();
      renderPage();
      const table = await openWordRules(user);

      const row = within(table).getByText("alpha").closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Edit rule" }));
      const dialog = await screen.findByRole("dialog", { name: "Edit rule" });
      expect(within(dialog).getByRole("checkbox", { name: IGNORE })).not.toBeChecked();
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Save" }));

      // The word is the same but the rule is not, so the server is asked about it again.
      await waitFor(() =>
        expect(mocks.words.validate).toHaveBeenCalledWith({
          scope: "tenant",
          rules: [{ kind: "keyword", pattern: "alpha", ignore_separators: true }],
        }),
      );
      expect(await screen.findByText(/Unsaved changes/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      expect(mocks.words.put.mock.calls[0][1].rules[0]).toEqual({
        id: "r1",
        kind: "keyword",
        pattern: "alpha",
        enabled: true,
        ignore_separators: true,
      });
    });

    test("a keyword of nothing but separators is refused in the dialog, without asking the server", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openAddDialog(user);

      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "- _ -");
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));

      expect(
        await within(dialog).findByText(/would match nothing\. Enter a word\./),
      ).toBeInTheDocument();
      expect(mocks.words.validate).not.toHaveBeenCalled();

      // Without the option it is an ordinary keyword: the separators are the word.
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
      await waitFor(() => expect(mocks.words.validate).toHaveBeenCalledTimes(1));
    });

    test("is another rule than the same word without it, and a duplicate of itself however it is spaced", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);

      // "alpha" is in the list without the option: with the option it is a new rule.
      let dialog = await openAddDialog(user);
      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "alpha");
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
      await waitFor(() => expect(mocks.words.validate).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Add rule" })).not.toBeInTheDocument(),
      );

      // Spelled with separators it is that same rule.
      dialog = await openAddDialog(user);
      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "A-L-P-H-A");
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
      expect(
        await within(dialog).findByText("This rule is already in the list."),
      ).toBeInTheDocument();
      expect(mocks.words.validate).toHaveBeenCalledTimes(1);
    });
  });

  describe("in an import", () => {
    async function openImport(user: User) {
      await user.click(screen.getByRole("button", { name: "Import file" }));
      return screen.findByRole("dialog", { name: "Import rules from a file" });
    }

    test("is a choice for every keyword of the file, and is sent with each of them", async () => {
      const user = userEvent.setup();
      mocks.words.validate.mockResolvedValue(allNew(2));
      renderPage();
      await openWordRules(user);
      const dialog = await openImport(user);

      await user.type(within(dialog).getByRole("textbox", { name: "Entries" }), "敏感词{Enter}bad word");
      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("button", { name: "Check" }));

      await waitFor(() =>
        expect(mocks.words.validate).toHaveBeenCalledWith({
          scope: "tenant",
          rules: [
            { kind: "keyword", pattern: "敏感词", ignore_separators: true },
            { kind: "keyword", pattern: "bad word", ignore_separators: true },
          ],
        }),
      );
      await user.click(await within(dialog).findByRole("button", { name: "Add to list (2)" }));

      expect(await screen.findAllByText("Ignores separators")).toHaveLength(2);
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      expect(
        mocks.words.put.mock.calls[0][1].rules.slice(0, 2).map((rule: WordRule) => rule.ignore_separators),
      ).toEqual([true, true]);
    });

    test("changing the choice withdraws a check made under the other one", async () => {
      const user = userEvent.setup();
      mocks.words.validate.mockResolvedValue(allNew(1));
      renderPage();
      await openWordRules(user);
      const dialog = await openImport(user);

      await user.type(within(dialog).getByRole("textbox", { name: "Entries" }), "newword");
      await user.click(within(dialog).getByRole("button", { name: "Check" }));
      expect(await within(dialog).findByRole("button", { name: "Add to list (1)" })).toBeEnabled();

      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      expect(within(dialog).getByRole("button", { name: "Add to list (0)" })).toBeDisabled();
    });

    test("is not offered for regular expressions, and does not stay on behind their back", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const dialog = await openImport(user);

      await user.click(within(dialog).getByRole("checkbox", { name: IGNORE }));
      await user.click(within(dialog).getByRole("radio", { name: "Regular expression" }));
      expect(within(dialog).queryByRole("checkbox", { name: IGNORE })).not.toBeInTheDocument();

      await user.type(within(dialog).getByRole("textbox", { name: "Entries" }), "a+");
      await user.click(within(dialog).getByRole("button", { name: "Check" }));
      await waitFor(() =>
        expect(mocks.words.validate).toHaveBeenCalledWith({
          scope: "tenant",
          rules: [{ kind: "regex", pattern: "a+" }],
        }),
      );

      // Coming back to keywords starts from "off" again: a box that was ticked before the detour
      // must not come back ticked, with nobody having looked at it since.
      await user.click(within(dialog).getByRole("radio", { name: "Keyword" }));
      expect(within(dialog).getByRole("checkbox", { name: IGNORE })).not.toBeChecked();
    });

    test("takes no more lines at a time than a request may carry", async () => {
      const user = userEvent.setup();
      mocks.words.overview.mockResolvedValue(
        wordOverview({ limits: { ...wordOverview().limits, max_rules: 3 } }),
      );
      renderPage();
      await openWordRules(user);
      const dialog = await openImport(user);

      await user.type(within(dialog).getByRole("textbox", { name: "Entries" }), "a{Enter}b{Enter}c{Enter}d");
      await user.click(within(dialog).getByRole("button", { name: "Check" }));

      expect(
        await within(dialog).findByText("At most 3 entries can be checked at once. Split the file."),
      ).toBeInTheDocument();
      expect(mocks.words.validate).not.toHaveBeenCalled();
    });
  });
});

describe("sensitive-word rules: the platform's list", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async (scope: string) =>
      scope === "platform"
        ? // What a tenant gets: the settings and the size of the list, not the list.
          wordView("platform", { can_edit: false, rules: [], rule_count: 120, rules_hidden: true })
        : wordView("tenant", { rules: [wordRule("r1", "alpha")] }),
    );
    mocks.keys.list.mockResolvedValue([]);
  });

  test("is not shown to a tenant: it says how long the list is instead of showing an empty one", async () => {
    const user = userEvent.setup();
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("radio", { name: "Platform" }));

    expect(await screen.findByText("Platform rules: 120")).toBeInTheDocument();
    expect(screen.getByText(/The platform's word list is not shown to tenants/)).toBeInTheDocument();
    // The line under the layer switch must not promise what the list no longer allows.
    expect(screen.getByText(/Tenants cannot see the word list, change it or switch it off/)).toBeInTheDocument();
    expect(screen.queryByText(/can read these rules/)).not.toBeInTheDocument();
    // An empty list would read as "the platform has no rules".
    expect(screen.queryByText("No rules yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Sensitive-word rule table" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
    // The settings that apply to the tenant's requests are still there to read.
    expect(screen.getByRole("switch", { name: "Enabled" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "When a rule matches" })).toBeInTheDocument();
  });

  test("is listed for whoever may read it", async () => {
    const user = userEvent.setup();
    mocks.words.get.mockImplementation(async (scope: string) =>
      scope === "platform"
        ? wordView("platform", { rules: [wordRule("p1", "forbidden")] })
        : wordView("tenant"),
    );
    renderPage();
    await openWordRules(user);

    await user.click(screen.getByRole("radio", { name: "Platform" }));

    expect(await screen.findByText("forbidden")).toBeInTheDocument();
    expect(screen.queryByText(/not shown to tenants/)).not.toBeInTheDocument();
  });
});

describe("sensitive-word rules: expressions that can match text of any length", () => {
  const rules = [wordRule("r1", "alpha"), wordRule("r2", "\\d+", { kind: "regex" }), wordRule("r3", "\\d{11}", { kind: "regex" })];

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.keys.list.mockResolvedValue([]);
  });

  const serve = (replyFilter: boolean) =>
    mocks.words.get.mockImplementation(async () =>
      wordView("tenant", {
        reply_filter: replyFilter,
        effective: { ...wordOverview().defaults, reply_filter: replyFilter },
        rules,
        unbounded_regex_ids: ["r2"],
      }),
    );

  test("are pointed out next to the reply filter and on their rows when replies are filtered", async () => {
    const user = userEvent.setup();
    serve(true);
    renderPage();
    const table = await openWordRules(user);

    expect(
      screen.getByText(/Regular expressions that can match text of any length \(for example \\d\+\): 1\./),
    ).toBeInTheDocument();
    const flagged = within(table).getByText("\\d+").closest("tr")!;
    expect(within(flagged).getByText("Unbounded")).toBeInTheDocument();
    // The bounded one and the keyword are left alone.
    expect(within(table).getAllByText("Unbounded")).toHaveLength(1);
  });

  test("are not argued about when replies are not filtered: a request is read whole", async () => {
    const user = userEvent.setup();
    serve(false);
    renderPage();
    const table = await openWordRules(user);

    expect(screen.queryByText(/can match text of any length/)).not.toBeInTheDocument();
    expect(within(table).queryByText("Unbounded")).not.toBeInTheDocument();
  });

  test("lose the note once the draft bounds them, without waiting for the save", async () => {
    const user = userEvent.setup();
    serve(true);
    renderPage();
    const table = await openWordRules(user);
    expect(within(table).getByText("Unbounded")).toBeInTheDocument();

    mocks.words.validate.mockResolvedValue(allNew(1));
    const row = within(table).getByText("\\d+").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Edit rule" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit rule" });
    const field = within(dialog).getByRole("textbox", { name: /^Rule/ });
    await user.clear(field);
    await user.type(field, "\\d{4}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(within(table).queryByText("Unbounded")).not.toBeInTheDocument());
    expect(screen.queryByText(/can match text of any length/)).not.toBeInTheDocument();
  });
});

describe("sensitive-word rules: the guard switched off by the operator", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.get.mockImplementation(async () => wordView("tenant", { rules: [wordRule("r1", "alpha")] }));
    mocks.keys.list.mockResolvedValue([]);
  });

  test("is said so above the rules, because nothing they say is applied", async () => {
    const user = userEvent.setup();
    mocks.words.overview.mockResolvedValue(wordOverview({ guard_enabled: false }));
    renderPage();
    await openWordRules(user);

    expect(screen.getByText("The word guard is switched off on this server")).toBeInTheDocument();
    expect(screen.getByText(/CLIRELAY_WORD_GUARD=off/)).toBeInTheDocument();
  });

  test.each([true, undefined])("is not mentioned when the guard is on (%s)", async (enabled) => {
    const user = userEvent.setup();
    mocks.words.overview.mockResolvedValue(wordOverview({ guard_enabled: enabled }));
    renderPage();
    await openWordRules(user);

    expect(screen.queryByText("The word guard is switched off on this server")).not.toBeInTheDocument();
  });
});
