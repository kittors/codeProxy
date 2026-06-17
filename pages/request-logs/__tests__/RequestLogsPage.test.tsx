import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { RequestLogsPage } from "@pages/request-logs/RequestLogsPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import type { UsageLogItem } from "@code-proxy/api-client/endpoints/usage";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const emptyLogsResponse = {
  items: [],
  total: 0,
  page: 1,
  size: 50,
  filters: {
    api_keys: [],
    api_key_names: {},
    models: [],
    channels: [],
  },
  stats: {
    total: 0,
    success_rate: 0,
    total_tokens: 0,
    total_cost: 0,
  },
};

const responseWithFilterOptions = {
  items: [],
  total: 0,
  page: 1,
  size: 50,
  filters: {
    api_keys: ["sk-primary", "sk-secondary"],
    api_key_names: {
      "sk-primary": "Primary",
      "sk-secondary": "Secondary",
    },
    models: ["gpt-5.4", "gpt-4.1"],
    channels: ["Codex", "Relay"],
  },
  stats: {
    total: 0,
    success_rate: 0,
    total_tokens: 0,
    total_cost: 0,
  },
};

const buildUsageLogItem = (overrides: Partial<UsageLogItem> = {}): UsageLogItem => ({
  id: 1,
  timestamp: "2026-04-08T12:00:00Z",
  api_key: "sk-test-123456",
  api_key_name: "Primary",
  model: "gpt-5.4",
  source: "codex",
  channel_name: "Codex",
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

const responseWithRows = (items: UsageLogItem[]) => ({
  ...responseWithFilterOptions,
  items,
  total: items.length,
  stats: {
    ...responseWithFilterOptions.stats,
    total: items.length,
    success_rate: 100,
    total_tokens: items.reduce((sum, item) => sum + item.total_tokens, 0),
  },
});

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
  clearUsageLogs: vi.fn(),
}));

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    configurable: true,
  });
}

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
  };
});

describe("RequestLogsPage", () => {
  beforeAll(() => {
    installLocalStorageMock();
  });

  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.localStorage.clear();
    mocks.getUsageLogs.mockReset();
    mocks.getLogContent.mockReset();
    mocks.clearUsageLogs.mockReset();
  });

  test("renders the first token latency column from backend data", async () => {
    await i18n.changeLanguage("en");

    mocks.getUsageLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          timestamp: "2026-04-08T12:00:00Z",
          api_key: "sk-test-123456",
          api_key_name: "Primary",
          model: "gpt-5.4",
          source: "codex",
          channel_name: "Codex",
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
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      filters: {
        api_keys: [],
        api_key_names: {},
        models: [],
        channels: [],
      },
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 30,
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("Duration")).toBeInTheDocument();
    expect(await screen.findByText("183ms")).toBeInTheDocument();
  });

  test("does not crash when backend returns null filter arrays", async () => {
    await i18n.changeLanguage("en");

    mocks.getUsageLogs.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      filters: {
        api_keys: null,
        api_key_names: null,
        models: null,
        channels: null,
      },
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("No Data")).toBeInTheDocument();
  });

  test("shows request-log multi-select filters as all-selected by default", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs.mockResolvedValue(responseWithFilterOptions);

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const [keyFilter, modelFilter, channelFilter, statusFilter] =
      await screen.findAllByRole("combobox");
    expect(keyFilter).toHaveTextContent("All Keys");
    expect(modelFilter).toHaveTextContent("All Models");
    expect(channelFilter).toHaveTextContent("All Channels");
    expect(statusFilter).toHaveTextContent("All Status");

    await user.click(keyFilter);

    expect(await screen.findByRole("option", { name: "Primary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("option", { name: "Secondary" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("only applies request-log multi-select changes after confirmation and restores full selection", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs.mockResolvedValue(responseWithFilterOptions);

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const [keyFilter] = await screen.findAllByRole("combobox");

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          api_keys: undefined,
          models: undefined,
          channels: undefined,
          statuses: undefined,
          api_keys_empty: false,
          models_empty: false,
          channels_empty: false,
          statuses_empty: false,
        }),
      ),
    );

    await user.click(keyFilter);
    await user.click(await screen.findByRole("option", { name: "Primary" }));

    expect(mocks.getUsageLogs).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          api_keys: ["sk-secondary"],
          api_keys_empty: false,
        }),
      ),
    );

    await user.click(keyFilter);
    await user.click(screen.getByRole("button", { name: "Select all" }));

    expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          api_keys: undefined,
          api_keys_empty: false,
        }),
      ),
    );

    await user.click(keyFilter);
    await user.click(screen.getByRole("option", { name: "Primary" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          api_keys: ["sk-secondary"],
          api_keys_empty: false,
        }),
      ),
    );

    await user.click(await screen.findByText("Reset filters"));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        5,
        expect.objectContaining({
          api_keys: undefined,
          api_keys_empty: false,
        }),
      ),
    );
  });

  test("supports deselecting all request-log filter options in one click", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs.mockResolvedValue(responseWithFilterOptions);

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const [keyFilter] = await screen.findAllByRole("combobox");

    await user.click(keyFilter);
    expect(await screen.findByRole("button", { name: "Deselect all" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByRole("combobox", { name: "Filter by Key name" })).toHaveTextContent(
      "0 selected",
    );

    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          api_keys: undefined,
          api_keys_empty: true,
        }),
      ),
    );
  });

  test("clears a request-log filter from the trigger and refreshes table data", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs
      .mockResolvedValueOnce(
        responseWithRows([
          buildUsageLogItem({ id: 1, model: "gpt-5.4" }),
          buildUsageLogItem({ id: 2, model: "gpt-4.1" }),
        ]),
      )
      .mockResolvedValueOnce(responseWithRows([buildUsageLogItem({ id: 3, model: "gpt-5.4" })]))
      .mockResolvedValueOnce(responseWithRows([buildUsageLogItem({ id: 4, model: "gpt-4.1" })]));

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const [, modelFilter] = await screen.findAllByRole("combobox");

    await user.click(modelFilter);
    await user.click(await screen.findByRole("option", { name: "gpt-4.1" }));
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          models: ["gpt-5.4"],
          models_empty: false,
        }),
      ),
    );
    expect(screen.getByRole("combobox", { name: "Filter by model" })).toHaveTextContent("gpt-5.4");

    await user.click(screen.getByRole("button", { name: "Clear model filter" }));

    await waitFor(() =>
      expect(mocks.getUsageLogs).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          models: undefined,
          models_empty: false,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Clear model filter" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("combobox", { name: "Filter by model" })).toHaveTextContent(
      "All Models",
    );
    expect(await screen.findByText("gpt-4.1")).toBeInTheDocument();
  });

  test("keeps the filtered-results bulk action hidden until the user actually searches", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs.mockResolvedValue(responseWithFilterOptions);

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const [, modelFilter] = await screen.findAllByRole("combobox");

    await user.click(modelFilter);
    await user.click(await screen.findByRole("option", { name: "gpt-5.4" }));

    expect(screen.getByRole("button", { name: /Select all/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Select shown/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "gpt");

    expect(screen.getByRole("button", { name: /Select shown/i })).toBeInTheDocument();
  });

  test("renders request logs table through the shared DataTable wrapper", async () => {
    await i18n.changeLanguage("zh-CN");

    mocks.getUsageLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          timestamp: "2026-04-08T12:00:00Z",
          api_key: "sk-test-123456",
          api_key_name: "Primary",
          model: "gpt-5.4",
          source: "codex",
          channel_name: "Codex",
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
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      filters: {
        api_keys: [],
        api_key_names: {},
        models: [],
        channels: [],
      },
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 30,
      },
    });

    const { container } = render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByRole("table", { name: "请求日志表" });
    expect(container.querySelector(".table-scrollbar")).not.toBeNull();
  });

  test("uses dashboard compact metric formatting without the updated-at summary text", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs.mockResolvedValue({
      items: [
        buildUsageLogItem({
          input_tokens: 2_806_800_000,
          cached_tokens: 2_576_200_000,
          output_tokens: 13_100_000,
          total_tokens: 2_819_900_000,
          cost: 12_345.67891,
          has_content: true,
        }),
      ],
      total: 23_800,
      page: 1,
      size: 50,
      filters: {
        api_keys: [],
        api_key_names: {},
        models: [],
        channels: [],
      },
      stats: {
        total: 23_800,
        success_rate: 99.5,
        total_tokens: 2_819_900_000,
        total_cost: 12_345.67891,
        cache_rate: 91.234,
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const recordsCount = await screen.findByText("23.8K records");
    expect(screen.queryByText(/Updated at/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not yet refreshed/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("2.8B").length).toBeGreaterThan(0);
    expect(screen.getByText("2.6B")).toBeInTheDocument();
    expect(screen.getByText("13.1M")).toBeInTheDocument();
    expect(screen.getAllByText("$12.35K").length).toBeGreaterThan(0);
    expect(screen.getByText("91.23%")).toBeInTheDocument();

    await user.hover(recordsCount);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("23,800.00");
    await user.unhover(recordsCount);

    const cachedTokens = screen.getByText("2.6B");
    await user.hover(cachedTokens);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("2,576,200,000.00");
    await user.unhover(cachedTokens);

    const cost = screen.getAllByText("$12.35K")[0];
    await user.hover(cost);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("$12,345.6789");
  });

  test("clears bulky request-log content by default while preserving request rows", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();

    mocks.getUsageLogs
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            timestamp: "2026-04-08T12:00:00Z",
            api_key: "sk-test-123456",
            api_key_name: "Primary",
            model: "gpt-5.4",
            source: "codex",
            channel_name: "Codex",
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
            has_content: true,
          },
        ],
        total: 1,
        page: 1,
        size: 50,
        filters: {
          api_keys: [],
          api_key_names: {},
          models: [],
          channels: [],
        },
        stats: {
          total: 1,
          success_rate: 100,
          total_tokens: 30,
          total_cost: 0.0123,
        },
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            timestamp: "2026-04-08T12:00:00Z",
            api_key: "sk-test-123456",
            api_key_name: "Primary",
            model: "gpt-5.4",
            source: "codex",
            channel_name: "Codex",
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
          },
        ],
        total: 1,
        page: 1,
        size: 50,
        filters: {
          api_keys: [],
          api_key_names: {},
          models: [],
          channels: [],
        },
        stats: {
          total: 1,
          success_rate: 100,
          total_tokens: 30,
          total_cost: 0.0123,
        },
      });
    mocks.clearUsageLogs.mockResolvedValue({
      deleted_logs: 0,
      deleted_contents: 1,
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Clear Database Logs" }));
    await user.click(await screen.findByRole("button", { name: "Clear Selected Data" }));

    await waitFor(() => expect(mocks.clearUsageLogs).toHaveBeenCalledTimes(1));
    expect(mocks.clearUsageLogs).toHaveBeenCalledWith({
      clear_body_content: true,
      clear_detail_content: true,
      clear_request_records: false,
    });
    expect(await screen.findByText("Primary")).toBeInTheDocument();
  });

  test("keeps the clear dialog open until cleanup and refresh both finish", async () => {
    await i18n.changeLanguage("en");
    const user = userEvent.setup();
    const cleanup = deferred<{ deleted_logs: number; deleted_contents: number }>();
    const refresh = deferred<typeof emptyLogsResponse>();

    mocks.getUsageLogs
      .mockResolvedValueOnce(emptyLogsResponse)
      .mockImplementationOnce(() => refresh.promise);
    mocks.clearUsageLogs.mockImplementationOnce(() => cleanup.promise);

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Clear Database Logs" }));
    await user.click(await screen.findByRole("button", { name: "Clear Selected Data" }));

    cleanup.resolve({ deleted_logs: 0, deleted_contents: 1 });
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));

    await new Promise((resolve) => window.setTimeout(resolve, 220));

    expect(screen.getByRole("dialog", { name: "Clear Database Logs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Selected Data" })).toBeDisabled();

    refresh.resolve(emptyLogsResponse);

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Clear Database Logs" })).not.toBeInTheDocument(),
    );
  });
});
