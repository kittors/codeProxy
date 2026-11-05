import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { RequestLogsPage } from "@pages/request-logs/RequestLogsPage";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";

// Loop protection on the request log page: the amber "Stopped" tag in the status
// column, and the filter that selects what it ended. Both must be absent on a backend
// without loop protection.

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
  getRequestLogBodyStorage: vi.fn(),
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
    configApi: { ...mod.configApi, getRequestLogBodyStorage: mocks.getRequestLogBodyStorage },
  };
});

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(window, "localStorage", { value: localStorageMock, configurable: true });
}

const item = (overrides: Partial<UsageLogItem> = {}): UsageLogItem => ({
  id: 1,
  timestamp: "2026-04-08T12:00:00Z",
  api_key: "sk-test-123456",
  api_key_name: "Primary",
  model: "gpt-5.4",
  source: "codex",
  channel_name: "Codex",
  provider: "codex",
  auth_type: "oauth",
  auth_index: "auth-1",
  failed: false,
  latency_ms: 1200,
  first_token_ms: 183,
  input_tokens: 10,
  output_tokens: 20,
  reasoning_tokens: 0,
  cached_tokens: 0,
  total_tokens: 30,
  cost: 0.0123,
  has_content: false,
  ...overrides,
});

/** What the API client hands the page for a backend with or without loop protection. */
const answer = (
  items: UsageLogItem[],
  guard: { supported: boolean; kinds?: string[] } = { supported: false },
) => ({
  items,
  total: items.length,
  page: 1,
  size: 50,
  capabilities: { apiKeyIdFilters: false, loopGuard: guard.supported },
  filters: {
    api_key_ids: [],
    api_key_id_names: {},
    api_key_id_counts: {},
    api_keys: [],
    api_key_names: {},
    api_key_counts: {},
    models: [],
    channels: [],
    channel_options: [],
    statuses: [],
    guard_kinds: guard.kinds ?? [],
  },
  stats: { total: items.length, success_rate: 50, total_tokens: 30, total_cost: 0 },
});

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <RequestLogsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const guardFilter = () => screen.queryByRole("combobox", { name: "Loop protection" });
const lastQuery = () => mocks.getUsageLogs.mock.calls.at(-1)?.[0] as Record<string, unknown>;

async function choose(option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Loop protection" }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("request log page and loop protection", () => {
  beforeAll(() => {
    installLocalStorageMock();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getRequestLogBodyStorage.mockResolvedValue(false);
  });

  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.clear();
  });

  describe("the status tag", () => {
    test("a request loop protection ended is amber 'Stopped', not a red failure, and says why", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer(
          [
            item({ id: 1, failed: true, guard_kind: "reply_loop" }),
            item({ id: 2, failed: true, guard_kind: "tool_loop" }),
            item({ id: 3, failed: true }),
            item({ id: 4, failed: false }),
          ],
          { supported: true, kinds: ["reply_loop", "tool_loop"] },
        ),
      );
      renderPage();

      const table = await screen.findByRole("table", { name: "Request Logs Table" });
      const stopped = within(table).getAllByRole("button", { name: "Stopped" });
      expect(stopped).toHaveLength(2);
      expect(stopped[0]).toHaveAttribute(
        "title",
        expect.stringMatching(/ended this reply because the model kept repeating itself/),
      );
      expect(stopped[1]).toHaveAttribute(
        "title",
        expect.stringMatching(/answered this request itself.*Nothing was sent upstream/),
      );
      // The plain failure and the success keep the words they always had.
      expect(within(table).getAllByRole("button", { name: "Failed" })).toHaveLength(1);
      expect(within(table).getAllByText("Success")).toHaveLength(1);
    });

    test("a kind this panel does not know still gets the tag, with the general sentence", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([item({ failed: true, guard_kind: "something_new" })], { supported: true }),
      );
      renderPage();
      const table = await screen.findByRole("table", { name: "Request Logs Table" });
      expect(within(table).getByRole("button", { name: "Stopped" })).toHaveAttribute(
        "title",
        "Loop protection ended this request. Click to see the detail.",
      );
    });

    test("a row of a backend without loop protection is what it always was", async () => {
      mocks.getUsageLogs.mockResolvedValue(answer([item({ failed: true })]));
      renderPage();
      const table = await screen.findByRole("table", { name: "Request Logs Table" });
      expect(within(table).getByRole("button", { name: "Failed" })).toBeInTheDocument();
      expect(within(table).queryByText("Stopped")).toBeNull();
    });

    test("the tag opens the same detail a failure opens", async () => {
      mocks.getLogContent.mockResolvedValue({
        id: 7,
        input_content: "",
        output_content: "",
        model: "gpt-5.4",
      });
      mocks.getUsageLogs.mockResolvedValue(
        answer([item({ id: 7, failed: true, guard_kind: "tool_loop" })], { supported: true }),
      );
      renderPage();
      const table = await screen.findByRole("table", { name: "Request Logs Table" });
      await userEvent.click(within(table).getByRole("button", { name: "Stopped" }));
      await waitFor(() => expect(mocks.getLogContent).toHaveBeenCalledWith(7));
    });
  });

  describe("the filter", () => {
    test("is not offered by a backend without loop protection, even if a facet were sent", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([item()], { supported: false, kinds: ["reply_loop"] }),
      );
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
      expect(guardFilter()).toBeNull();
      expect(lastQuery().guard_kinds).toBeUndefined();
    });

    test("is not offered while nothing was ever stopped", async () => {
      mocks.getUsageLogs.mockResolvedValue(answer([item()], { supported: true, kinds: [] }));
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
      expect(guardFilter()).toBeNull();
    });

    test("is offered once something was stopped, listing only the kinds that exist", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([item()], { supported: true, kinds: ["reply_loop"] }),
      );
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
      await userEvent.click(screen.getByRole("combobox", { name: "Loop protection" }));
      const options = (await screen.findAllByRole("option")).map((option) => option.textContent);
      expect(options).toEqual(["All requests", "Replies cut for repeating"]);
    });

    test("choosing a kind asks the backend for exactly that kind", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([item()], { supported: true, kinds: ["reply_loop", "tool_loop"] }),
      );
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
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
        .mockResolvedValueOnce(answer([item()], { supported: true, kinds: ["tool_loop"] }))
        .mockResolvedValue(answer([], { supported: true, kinds: [] }));
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });

      await choose("Tool-call loops answered");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["tool_loop"]));
      expect(guardFilter()).toHaveTextContent("Tool-call loops answered");
    });

    test("reset filters clears it with the others", async () => {
      mocks.getUsageLogs.mockResolvedValue(
        answer([item()], { supported: true, kinds: ["reply_loop", "tool_loop"] }),
      );
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
      await choose("Replies cut for repeating");
      await waitFor(() => expect(lastQuery().guard_kinds).toEqual(["reply_loop"]));

      await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
      await waitFor(() => expect(lastQuery().guard_kinds).toBeUndefined());
      expect(guardFilter()).toHaveTextContent("Loop protection");
    });

    test("a backend that loses loop protection under an open page drops the choice instead of asking for it", async () => {
      mocks.getUsageLogs
        .mockResolvedValueOnce(answer([item()], { supported: true, kinds: ["tool_loop"] }))
        .mockResolvedValueOnce(answer([item()], { supported: false }))
        .mockResolvedValue(answer([item()], { supported: false }));
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });

      await choose("Tool-call loops answered");
      await waitFor(() => expect(guardFilter()).toBeNull());
      // The fetch the dropped choice triggers goes out without it.
      await waitFor(() => expect(lastQuery().guard_kinds).toBeUndefined());
    });

    test("a response that declares no capabilities at all is read as a backend without them", async () => {
      const bare = answer([item()]);
      mocks.getUsageLogs.mockResolvedValue({ ...bare, capabilities: undefined });
      renderPage();
      await screen.findByRole("table", { name: "Request Logs Table" });
      expect(guardFilter()).toBeNull();
    });
  });
});
