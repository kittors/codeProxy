import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import {
  findLogGrid,
  legacyItem,
  logsAnswer,
  queryOf,
  renderRequestLogsPage,
} from "./requestLogsTestKit";

// Loop protection on the request log page: the amber "Stopped" tag in the status column, and the
// filter that selects what it ended. Both must be absent on a backend without loop protection.

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
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
    },
    configApi: {
      ...mod.configApi,
      getRequestLogBodyStorage: mocks.getRequestLogBodyStorage,
      getConfig: mocks.getConfig,
    },
  };
});

/** What the API client hands the page for a backend with or without loop protection. */
const answer = (
  items: ReturnType<typeof legacyItem>[],
  guard: { supported: boolean; kinds?: string[] } = { supported: false },
) =>
  logsAnswer(items, {
    capabilities: { loopGuard: guard.supported },
    filters: { statuses: [], guard_kinds: guard.kinds ?? [] },
    stats: { success_rate: 50 },
  });

const guardFilter = () => screen.queryByRole("combobox", { name: "Loop protection" });
const lastQuery = () => queryOf(mocks.getUsageLogs.mock.calls) ?? {};

async function choose(option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Loop protection" }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/** The status tag's explanation is its hover tooltip. */
async function hintOf(tag: HTMLElement) {
  await userEvent.hover(tag);
  const tooltip = await screen.findByRole("tooltip");
  const text = tooltip.textContent;
  await userEvent.unhover(tag);
  await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  return text;
}

describe("request log page and loop protection", () => {
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
  });

  describe("the status tag", () => {
    test("a request loop protection ended is amber 'Stopped', not a red failure, and says why", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer(
          [
            legacyItem({ id: 1, failed: true, guard_kind: "reply_loop" }),
            legacyItem({ id: 2, failed: true, guard_kind: "tool_loop" }),
            legacyItem({ id: 3, failed: true }),
            legacyItem({ id: 4, failed: false }),
          ],
          { supported: true, kinds: ["reply_loop", "tool_loop"] },
        ),
      );
      renderRequestLogsPage();

      const grid = await findLogGrid();
      const stopped = await within(grid).findAllByRole("button", { name: "Stopped" });
      expect(stopped).toHaveLength(2);
      expect(await hintOf(stopped[0])).toMatch(
        /ended this reply because the model kept repeating itself/,
      );
      expect(await hintOf(stopped[1])).toMatch(
        /answered this request itself.*Nothing was sent upstream/,
      );
      // The plain failure and the success keep the words they always had.
      expect(within(grid).getAllByRole("button", { name: "Failed" })).toHaveLength(1);
      expect(within(grid).getAllByText("Success")).toHaveLength(1);
    });

    test("a kind this panel does not know still gets the tag, with the general sentence", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem({ failed: true, guard_kind: "something_new" })], { supported: true }),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      const tag = await within(grid).findByRole("button", { name: "Stopped" });
      expect(await hintOf(tag)).toBe(
        "Loop protection ended this request. Click to see the detail.",
      );
    });

    test("a row of a backend without loop protection is what it always was", async () => {
      mocks.getUsageLogs.mockResolvedValue(answer([legacyItem({ failed: true })]));
      renderRequestLogsPage();
      const grid = await findLogGrid();
      expect(await within(grid).findByRole("button", { name: "Failed" })).toBeInTheDocument();
      expect(within(grid).queryByText("Stopped")).toBeNull();
    });

    test("the tag opens the same detail a failure opens", async () => {
      mocks.getLogContent.mockResolvedValue({
        id: 7,
        input_content: "",
        output_content: "",
        model: "gpt-5.4",
      });
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem({ id: 7, failed: true, guard_kind: "tool_loop" })], { supported: true }),
      );
      renderRequestLogsPage();
      const grid = await findLogGrid();
      await userEvent.click(await within(grid).findByRole("button", { name: "Stopped" }));
      await waitFor(() => expect(mocks.getLogContent).toHaveBeenCalledWith(7));
    });
  });

  describe("the filter", () => {
    test("is not offered by a backend without loop protection, even if a facet were sent", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem()], { supported: false, kinds: ["reply_loop"] }),
      );
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("Primary");
      expect(guardFilter()).toBeNull();
      expect(lastQuery().guard_kinds).toBeUndefined();
    });

    test("is not offered while nothing was ever stopped", async () => {
      mocks.getUsageLogs.mockResolvedValue(answer([legacyItem()], { supported: true, kinds: [] }));
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("Primary");
      expect(guardFilter()).toBeNull();
    });

    test("is offered once something was stopped, listing only the kinds that exist", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem()], { supported: true, kinds: ["reply_loop"] }),
      );
      renderRequestLogsPage();
      await userEvent.click(await screen.findByRole("combobox", { name: "Loop protection" }));
      const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
      expect(options).toEqual(["All requests", "Replies cut for repeating"]);
    });

    test("choosing a kind asks the backend for exactly that kind", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem()], { supported: true, kinds: ["reply_loop", "tool_loop"] }),
      );
      renderRequestLogsPage();
      await screen.findByRole("combobox", { name: "Loop protection" });
      expect(lastQuery().guard_kinds).toBeUndefined();

      await choose("Tool-call loops answered");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["tool_loop"]));

      await choose("Replies cut for repeating");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["reply_loop"]));

      await choose("Stopped by loop protection");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["reply_loop", "tool_loop"]));

      await choose("All requests");
      await waitFor(() => expect(lastQuery().guard_kinds).toBeUndefined());
    });

    test("a choice stays on screen when the other filters leave no such request, so it can be undone", async () => {
      mocks.getUsageLogs
        .mockResolvedValueOnce(answer([legacyItem()], { supported: true, kinds: ["tool_loop"] }))
        .mockResolvedValue(answer([], { supported: true, kinds: [] }));
      renderRequestLogsPage();
      await screen.findByRole("combobox", { name: "Loop protection" });

      await choose("Tool-call loops answered");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["tool_loop"]));
      expect(guardFilter()).toHaveTextContent("Tool-call loops answered");
      // The empty table says which condition left nothing, and the chip row can undo it.
      const grid = await findLogGrid();
      expect(await within(grid).findByText("No requests match")).toBeInTheDocument();
      expect(within(grid).getByRole("list", { name: "Filters in effect" })).toHaveTextContent(
        "Loop protection：Tool-call loops answered",
      );
    });

    test("clearing all filters clears it with the others", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([legacyItem()], { supported: true, kinds: ["reply_loop", "tool_loop"] }),
      );
      renderRequestLogsPage();
      await screen.findByRole("combobox", { name: "Loop protection" });
      await choose("Replies cut for repeating");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["reply_loop"]));

      await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
      await waitFor(() => expect(lastQuery().guard_kinds).toBeUndefined());
      expect(guardFilter()).toHaveTextContent("Loop protection");
    });

    test("a backend that loses loop protection under an open page drops the choice instead of asking for it", async () => {
      mocks.getUsageLogs
        .mockResolvedValueOnce(answer([legacyItem()], { supported: true, kinds: ["tool_loop"] }))
        .mockResolvedValueOnce(answer([legacyItem()], { supported: false }))
        .mockResolvedValue(answer([legacyItem()], { supported: false }));
      renderRequestLogsPage();
      await screen.findByRole("combobox", { name: "Loop protection" });

      await choose("Tool-call loops answered");
      await waitFor(() => expect(guardFilter()).toBeNull());
      // The fetch the dropped choice triggers goes out without it.
      await waitFor(() => expect(lastQuery().guard_kinds).toBeUndefined());
    });

    test("a response that declares no capabilities at all is read as a backend without them", async () => {
      const bare = answer([legacyItem()]);
      mocks.getUsageLogs.mockResolvedValue({ ...bare, capabilities: undefined });
      renderRequestLogsPage();
      await within(await findLogGrid()).findByText("Primary");
      expect(guardFilter()).toBeNull();
    });
  });
});
