import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { WordRule } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ContentModerationPage } from "../ContentModerationPage";
import { WITH_WORD_GUARD, wordOverview, wordRule, wordView } from "./wordFixtures";

/**
 * What keeps an editor's work from going missing or being changed behind their back: the draft is
 * confirmed away before a refresh or a tab switch drops it, and a setting nobody touched is saved
 * as "inherit" instead of as the default of the day.
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

const tenantRules = [wordRule("r1", "alpha"), wordRule("r2", "beta")];

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

describe("sensitive-word rules: the draft is not lost or rewritten silently", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.profiles.listProfiles.mockResolvedValue({ items: [], capabilities: WITH_WORD_GUARD });
    mocks.words.overview.mockResolvedValue(wordOverview());
    mocks.words.get.mockImplementation(async () =>
      // Nothing is chosen on this policy: every setting is empty and shows the default.
      wordView("tenant", {
        action: "",
        scan_scope: "",
        reply_filter: null,
        fold_traditional_chinese: null,
        rules: tenantRules,
      }),
    );
    mocks.words.put.mockImplementation(async (_scope: string, input: { rules: WordRule[] }) =>
      wordView("tenant", { version: 4, rules: input.rules.map((rule) => ({ ...rule, id: rule.id ?? "n" })) }),
    );
    mocks.words.validate.mockResolvedValue({
      summary: {
        total: 1,
        new: 1,
        duplicate: 0,
        existing: 0,
        invalid: 0,
        existing_rules: 0,
        existing_regex: 0,
        new_regex: 0,
        fits: true,
      },
      reviews: [],
    });
    mocks.keys.list.mockResolvedValue([]);
  });

  describe("settings nobody touched", () => {
    test("show the default they follow, and are saved as inherited, not as that default", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);

      // The policy has chosen nothing, so the screen shows what the defaults amount to.
      expect(screen.getByRole("combobox", { name: "When a rule matches" })).toHaveTextContent(
        "Block the request",
      );
      expect(screen.getByRole("combobox", { name: "Text to check" })).toHaveTextContent(
        "All user messages",
      );
      expect(screen.getByRole("switch", { name: "Filter model replies" })).not.toBeChecked();

      // An unrelated change: one more rule.
      await user.click(screen.getByRole("button", { name: "Add rule" }));
      const dialog = await screen.findByRole("dialog", { name: "Add rule" });
      await user.type(within(dialog).getByRole("textbox", { name: /^Rule/ }), "gamma");
      await user.click(within(dialog).getByRole("button", { name: "Add rule" }));
      await screen.findByText("gamma");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      // Writing the defaults in would freeze today's defaults into the policy.
      expect(mocks.words.put.mock.calls[0][1]).toMatchObject({
        action: "",
        scan_scope: "",
        reply_filter: null,
        fold_traditional_chinese: null,
      });
    });

    test("a switch that follows a default which is on shows as on, and is saved as inherited", async () => {
      const user = userEvent.setup();
      // The server's view of a policy that follows a default which happens to be on.
      const followingDefault = (replyFilter: boolean | null, rules: WordRule[], version: number) =>
        wordView("tenant", {
          version,
          reply_filter: replyFilter,
          effective: { ...wordOverview().defaults, reply_filter: replyFilter ?? true },
          rules,
        });
      mocks.words.get.mockImplementation(async () => followingDefault(null, tenantRules, 3));
      mocks.words.put.mockImplementation(
        async (_scope: string, input: { reply_filter: boolean | null; rules: WordRule[]; version: number }) =>
          followingDefault(input.reply_filter, input.rules, input.version + 1),
      );
      renderPage();
      await openWordRules(user);

      expect(screen.getByRole("switch", { name: "Filter model replies" })).toBeChecked();

      // An unrelated change leaves it inherited; turning it off is a choice.
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      expect(mocks.words.put.mock.calls[0][1].reply_filter).toBeNull();

      await user.click(screen.getByRole("switch", { name: "Filter model replies" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(2));
      expect(mocks.words.put.mock.calls[1][1].reply_filter).toBe(false);
    });

    test("only the setting that was changed becomes a choice", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);

      await user.click(screen.getByRole("combobox", { name: "When a rule matches" }));
      await user.click(await screen.findByRole("option", { name: "Log only" }));
      await user.click(screen.getByRole("switch", { name: "Filter model replies" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(mocks.words.put).toHaveBeenCalledTimes(1));
      expect(mocks.words.put.mock.calls[0][1]).toMatchObject({
        action: "log",
        scan_scope: "",
        reply_filter: true,
        fold_traditional_chinese: null,
      });
    });
  });

  describe("refreshing", () => {
    test("with unsaved changes asks first, and cancelling keeps the draft", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      const loads = mocks.words.get.mock.calls.length;
      const overviews = mocks.words.overview.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Refresh" }));
      const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
      expect(within(dialog).getByText(/Reloading now loses them/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      // Nothing was reloaded and the edit is still there.
      expect(mocks.words.get.mock.calls.length).toBe(loads);
      expect(mocks.words.overview.mock.calls.length).toBe(overviews);
      expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();
      expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    });

    test("with unsaved changes reloads once the loss is confirmed", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      const loads = mocks.words.get.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Refresh" }));
      const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
      await user.click(within(dialog).getByRole("button", { name: "Discard and reload" }));

      await waitFor(() => expect(mocks.words.get.mock.calls.length).toBe(loads + 1));
      expect(await screen.findByRole("switch", { name: "Toggle rule alpha" })).toBeChecked();
      expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    });

    test("without changes reloads straight away", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      const loads = mocks.words.get.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Refresh" }));

      await waitFor(() => expect(mocks.words.get.mock.calls.length).toBe(loads + 1));
      expect(screen.queryByRole("dialog", { name: "Discard unsaved changes?" })).not.toBeInTheDocument();
    });
  });

  describe("leaving for the other tab of the page", () => {
    test("with unsaved changes asks first, and cancelling stays with the draft", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));

      await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));
      const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.getByRole("tab", { name: "Sensitive words" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("switch", { name: "Toggle rule alpha" })).not.toBeChecked();
    });

    test("with unsaved changes leaves once the loss is confirmed, and the draft is gone", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));

      await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));
      const dialog = await screen.findByRole("dialog", { name: "Discard unsaved changes?" });
      await user.click(within(dialog).getByRole("button", { name: "Discard and switch" }));

      expect(await screen.findByText("No moderation profiles")).toBeInTheDocument();
      // Back again: the policy is loaded afresh, without the edit.
      await user.click(screen.getByRole("tab", { name: "Sensitive words" }));
      expect(await screen.findByRole("switch", { name: "Toggle rule alpha" })).toBeChecked();
    });

    test("without changes leaves at once", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);

      await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));

      expect(await screen.findByText("No moderation profiles")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Discard unsaved changes?" })).not.toBeInTheDocument();
    });

    test("after the changes were saved there is nothing to confirm", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(screen.getByText("Saved · version 4")).toBeInTheDocument());
      expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));

      expect(await screen.findByText("No moderation profiles")).toBeInTheDocument();
    });
  });

  describe("closing or reloading the browser tab", () => {
    const leave = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    test("is held back by the browser's own prompt while there are unsaved changes", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      expect(leave()).toBe(false);

      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      expect(leave()).toBe(true);

      await user.click(screen.getByRole("button", { name: "Discard changes" }));
      expect(leave()).toBe(false);
    });

    test("is not held back once the page has left the words tab", async () => {
      const user = userEvent.setup();
      renderPage();
      await openWordRules(user);
      await user.click(screen.getByRole("switch", { name: "Toggle rule alpha" }));
      await user.click(screen.getByRole("tab", { name: "Moderation profiles" }));
      await user.click(
        within(await screen.findByRole("dialog", { name: "Discard unsaved changes?" })).getByRole(
          "button",
          { name: "Discard and switch" },
        ),
      );
      await screen.findByText("No moderation profiles");

      expect(leave()).toBe(false);
    });
  });
});
