import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { LogsPage } from "../LogsPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  fetchLogs: vi.fn(),
  fetchErrorLogs: vi.fn(),
  clearLogs: vi.fn(),
  downloadErrorLog: vi.fn(),
  downloadRequestLogById: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    logsApi: {
      ...mod.logsApi,
      fetchLogs: mocks.fetchLogs,
      fetchErrorLogs: mocks.fetchErrorLogs,
      clearLogs: mocks.clearLogs,
      downloadErrorLog: mocks.downloadErrorLog,
      downloadRequestLogById: mocks.downloadRequestLogById,
    },
  };
});

function renderLogsPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <LogsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("LogsPage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.clearAllMocks();
  });

  test("uses a backend-safe limit for the initial log fetch", async () => {
    await i18n.changeLanguage("zh-CN");

    mocks.fetchLogs.mockResolvedValue({
      lines: [],
      "latest-timestamp": null,
    });

    renderLogsPage();

    await waitFor(() => expect(mocks.fetchLogs).toHaveBeenCalledWith({ limit: 20000 }));
  });

  test("treats an empty error log list as loaded instead of retrying", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    mocks.fetchLogs.mockResolvedValue({
      lines: [],
      "latest-timestamp": null,
    });
    mocks.fetchErrorLogs
      .mockResolvedValueOnce({ files: [] })
      .mockImplementation(() => new Promise(() => undefined));

    renderLogsPage();

    await user.click(await screen.findByRole("tab", { name: "错误日志" }));

    expect(await screen.findByText("暂无错误日志")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchErrorLogs).toHaveBeenCalledTimes(1));
  });

  test("renders diagnostic summary for request error logs", async () => {
    await i18n.changeLanguage("zh-CN");
    const user = userEvent.setup();

    mocks.fetchLogs.mockResolvedValue({
      lines: [],
      "latest-timestamp": null,
    });
    mocks.fetchErrorLogs.mockResolvedValue({
      files: [
        {
          name: "error-deepseekv4flash-chatgpt-cs_3e13ca9880fc-v1-responses-20260703-d53bf806.log",
          size: 1234,
          modified: 1783067896,
          request_id: "d53bf806",
          status: 429,
          error_code: "rpm_limit_exceeded",
          error_type: "rate_limit_exceeded",
          original_url: "/deepseekv4flash-chatgpt/cs_3e13ca9880fc/v1/responses",
          effective_url: "/v1/responses",
          route_group: "deepseekv4flash-chatgpt",
          route_path: "/cs_3e13ca9880fc/v1",
          model: "deepseek-chat",
          provider: "deepseek",
          rejected_by: "rpm",
        },
      ],
    });

    renderLogsPage();

    await user.click(await screen.findByRole("tab", { name: "错误日志" }));

    expect(await screen.findByText("响应状态")).toBeInTheDocument();
    expect(screen.getByText("rpm_limit_exceeded")).toBeInTheDocument();
    expect(screen.getByText("d53bf806")).toBeInTheDocument();
    expect(
      screen.getByText("/deepseekv4flash-chatgpt/cs_3e13ca9880fc/v1/responses"),
    ).toBeInTheDocument();
    expect(screen.getByText("/v1/responses")).toBeInTheDocument();
    expect(screen.getByText("deepseekv4flash-chatgpt · /cs_3e13ca9880fc/v1")).toBeInTheDocument();
  });

  test("renders long request paths without a full-pill badge", async () => {
    await i18n.changeLanguage("zh-CN");

    const longPath =
      "/v0/management/usage/entity-stats?days=30&auth_index=c354956ed44cc510&source=t%3Aantigravity-yuan364299311%40gmail.com.json";
    mocks.fetchLogs.mockResolvedValue({
      lines: [
        `2026-06-14 09:25:21 [INFO] [gin_logger.go:96] 200 | 288ms | 36.159.232.171 | GET "${longPath}"`,
      ],
      "latest-timestamp": null,
    });

    renderLogsPage();

    const path = await screen.findByText(longPath);
    const pathContainer = path.closest("code");

    expect(pathContainer).toBeInTheDocument();
    expect(pathContainer).toHaveClass("rounded-md");
    expect(pathContainer).not.toHaveClass("rounded-full");
  });
});
