import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { RequestLogsPage } from "@/modules/monitor/RequestLogsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

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

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
  clearUsageLogs: vi.fn(),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
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
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
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

    expect(await screen.findByText("First Token")).toBeInTheDocument();
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

  test("renders request logs table through the shared VirtualTable wrapper", async () => {
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
