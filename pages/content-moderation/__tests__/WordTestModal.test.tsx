import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { WordTestResult } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";
import { WITH_WORD_GUARD, wordOverview, wordRule, wordView } from "./wordFixtures";

const mocks = vi.hoisted(() => ({
  profiles: { listProfiles: vi.fn(), testProfile: vi.fn() },
  words: { overview: vi.fn(), get: vi.fn(), test: vi.fn() },
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  contentModerationApi: mocks.profiles,
  wordPolicyApi: mocks.words,
}));

const base: WordTestResult = {
  action: "allow",
  blocked: false,
  output: "",
  matches: [],
  match_count: 0,
  replaced: 0,
  layers: ["platform", "tenant"],
  reply_filter: false,
  latency_ms: 2,
};

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ContentModerationPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

async function openTestDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("tab", { name: "Sensitive words" }));
  await screen.findByRole("table", { name: "Sensitive-word rule table" });
  await user.click(screen.getByRole("button", { name: "Test" }));
  return screen.findByRole("dialog", { name: "Test sensitive-word rules" });
}

describe("testing sensitive-word rules", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async () =>
      wordView("tenant", { rules: [wordRule("r1", "secret")] }),
    );
  });

  test("highlights each hit where it is in the text and tells which ones needed normalizing", async () => {
    const user = userEvent.setup();
    const input = "Say ＳＥＣＲＥＴ and secret";
    mocks.words.test.mockResolvedValue({
      ...base,
      action: "block",
      blocked: true,
      block_message: "Blocked by policy",
      output: input,
      match_count: 2,
      matches: [
        {
          layer: "tenant",
          rule_id: "r1",
          kind: "keyword",
          pattern: "secret",
          action: "block",
          source: "messages.0.content",
          // Offsets are UTF-16 code units into the text that was sent.
          start: 4,
          end: 10,
          normalized_only: true,
        },
        {
          layer: "platform",
          rule_id: "p1",
          kind: "keyword",
          pattern: "secret",
          action: "block",
          source: "messages.0.content",
          start: 15,
          end: 21,
          normalized_only: false,
        },
      ],
    } satisfies WordTestResult);
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), input);
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    await waitFor(() =>
      expect(mocks.words.test).toHaveBeenCalledWith({ input, scope: "tenant" }),
    );
    expect(await within(dialog).findByText("This request would be blocked")).toBeInTheDocument();
    expect(within(dialog).getByText("Blocked by policy")).toBeInTheDocument();

    const marks = within(dialog).getByTestId("word-test-highlight").querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent("ＳＥＣＲＥＴ");
    expect(marks[0]).toHaveAttribute("data-normalized-only", "true");
    expect(marks[1]).toHaveTextContent("secret");
    expect(marks[1]).not.toHaveAttribute("data-normalized-only");
    expect(within(dialog).getByText(/Dotted underline: this hit only matched after/)).toBeInTheDocument();

    // The hits table says which layer each hit came from and how it matched.
    const rows = within(dialog).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("This tenant");
    expect(rows[0]).toHaveTextContent("After normalization");
    expect(rows[1]).toHaveTextContent("Platform");
    expect(rows[1]).toHaveTextContent("As written");
  });

  test("shows the text the model would receive and the same text as a reply", async () => {
    const user = userEvent.setup();
    mocks.words.test.mockResolvedValue({
      ...base,
      action: "replace",
      output: "my ***",
      replaced: 1,
      match_count: 25,
      reply_filter: true,
      reply_output: "my ***",
      matches: [
        {
          layer: "tenant",
          rule_id: "r1",
          kind: "keyword",
          pattern: "secret",
          action: "replace",
          source: "messages.0.content",
          start: 3,
          end: 9,
          normalized_only: false,
        },
      ],
    } satisfies WordTestResult);
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), "my secret");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    expect(
      await within(dialog).findByText("This request would be rewritten (replacements: 1)"),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId("word-test-output")).toHaveTextContent("my ***");
    expect(within(dialog).getByTestId("word-test-reply")).toHaveTextContent("my ***");
    // Only the first hits come back; the dialog says so rather than implying it is all of them.
    expect(within(dialog).getByText("Showing the first 1 of 25 hits.")).toBeInTheDocument();
  });

  test("a hit of the platform's word list names the rule's place, not its word", async () => {
    const user = userEvent.setup();
    const input = "a secret b";
    mocks.words.test.mockResolvedValue({
      ...base,
      action: "block",
      blocked: true,
      block_message: "Blocked by policy",
      output: input,
      match_count: 1,
      matches: [
        {
          layer: "platform",
          rule_id: "p1",
          kind: "keyword",
          // What the server sends a tenant: the word is taken out and the rule says so.
          pattern: "",
          pattern_hidden: true,
          action: "block",
          source: "messages.0.content",
          start: 2,
          end: 8,
          normalized_only: false,
        },
      ],
    } satisfies WordTestResult);
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), input);
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    const row = (await within(dialog).findAllByRole("row"))[1];
    expect(row).toHaveTextContent("Platform");
    expect(row).toHaveTextContent("Platform rule (not shown)");
    // The tenant's own text is still marked where the platform's rule hit it.
    const marks = within(dialog).getByTestId("word-test-highlight").querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("secret");
  });

  test("a request refused because a hit cannot be replaced says why, and where it sits", async () => {
    const user = userEvent.setup();
    mocks.words.test.mockResolvedValue({
      ...base,
      action: "block",
      blocked: true,
      reason: "unrewritable",
      field: "messages[0].content[1].input (an object key)",
      block_message: "Blocked by policy. The text in messages[0].content[1].input cannot be replaced.",
      output: "x",
    } satisfies WordTestResult);
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    expect(await within(dialog).findByText("This request would be blocked")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/sits where it cannot be replaced \(an object key, or JSON inside a string\)/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Where: messages[0].content[1].input (an object key)"),
    ).toBeInTheDocument();
  });

  test("says when the regular expressions had to be left out of a very large text", async () => {
    const user = userEvent.setup();
    mocks.words.test.mockResolvedValue({ ...base, regex_skipped: true, output: "x" });
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), "x");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    expect(
      await within(dialog).findByText(/larger than the regular expressions may work on, so only keywords were checked/),
    ).toBeInTheDocument();
  });

  test("explains a dotted underline on a keyword that ignores separators", async () => {
    const user = userEvent.setup();
    const input = "a 敏 感 词 b";
    mocks.words.test.mockResolvedValue({
      ...base,
      action: "log",
      output: input,
      match_count: 1,
      matches: [
        {
          layer: "tenant",
          rule_id: "r1",
          kind: "keyword",
          pattern: "敏感词",
          action: "log",
          source: "messages.0.content",
          start: 2,
          end: 7,
          normalized_only: true,
        },
      ],
    } satisfies WordTestResult);
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), input);
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    const marks = (await within(dialog).findByTestId("word-test-highlight")).querySelectorAll("mark");
    expect(marks[0]).toHaveTextContent("敏 感 词");
    expect(marks[0]).toHaveAttribute("data-normalized-only", "true");
    expect(within(dialog).getByText(/for a keyword that ignores separators/)).toBeInTheDocument();
  });

  test("a text with nothing in it says so, and sends the text exactly as typed", async () => {
    const user = userEvent.setup();
    mocks.words.test.mockResolvedValue({ ...base, output: "  hello  " });
    renderPage();
    const dialog = await openTestDialog(user);

    await user.type(within(dialog).getByLabelText("Test input"), "  hello  ");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    expect(await within(dialog).findByText("No sensitive words found")).toBeInTheDocument();
    // Not trimmed: hit offsets refer to the text as sent, so it must not change on the way.
    expect(mocks.words.test).toHaveBeenCalledWith({ input: "  hello  ", scope: "tenant" });
    expect(within(dialog).queryByTestId("word-test-highlight")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("word-test-output")).not.toBeInTheDocument();
  });

  test("tries the unsaved edits instead of the saved rules when there are any", async () => {
    const user = userEvent.setup();
    mocks.words.test.mockResolvedValue(base);
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Sensitive words" }));
    await screen.findByRole("table", { name: "Sensitive-word rule table" });

    await user.click(screen.getByRole("switch", { name: "Toggle rule secret" }));
    await user.click(screen.getByRole("button", { name: "Test" }));
    const dialog = await screen.findByRole("dialog", { name: "Test sensitive-word rules" });
    expect(within(dialog).getByText(/Runs the text through your unsaved changes/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Test input"), "hello");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));

    await waitFor(() => expect(mocks.words.test).toHaveBeenCalledTimes(1));
    const request = mocks.words.test.mock.calls[0][0];
    expect(request).toMatchObject({ input: "hello", scope: "tenant" });
    expect(request.draft).toMatchObject({
      version: 3,
      rules: [{ id: "r1", kind: "keyword", pattern: "secret", enabled: false }],
    });
  });
});
