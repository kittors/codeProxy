import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLogContent: vi.fn(),
  getLogContentPart: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    usageApi: {
      ...mod.usageApi,
      getLogContent: mocks.getLogContent,
      getLogContentPart: mocks.getLogContentPart,
    },
  };
});

import i18n from "@code-proxy/i18n";
import { ErrorDetailModal } from "@features/log-content-viewer";
import { ThemeProvider } from "@code-proxy/ui";

describe("ErrorDetailModal", () => {
  afterEach(async () => {
    cleanup();
    mocks.getLogContent.mockReset();
    mocks.getLogContentPart.mockReset();
    await i18n.changeLanguage("zh-CN");
  });

  test("reconstructs a compact error summary from request details when output is empty", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 486781,
      model: "grok-4.5",
      input_content: "",
      output_content: "",
    });
    mocks.getLogContentPart.mockResolvedValue({
      id: 486781,
      model: "grok-4.5",
      part: "details",
      content: JSON.stringify({
        diagnostic: {
          upstream: {
            provider: "xai",
            status: 429,
            auth_label: "p8i7bwc5wt@aokkas.com",
            url: "https://cli-chat-proxy.grok.com/v1/responses",
            attempt: 109,
          },
        },
        response: {
          upstream_log:
            "=== API RESPONSE 1 ===\nStatus: 429\nHeaders:\nX-Request-Id: abc\n\n",
        },
      }),
    });

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={486781} model="grok-4.5" onClose={() => {}} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.getLogContent).toHaveBeenCalledWith(486781);
      expect(mocks.getLogContentPart).toHaveBeenCalledWith(486781, "details");
    });

    expect(await screen.findByText("已从请求详情还原上游错误摘要")).toBeInTheDocument();
    expect(screen.getAllByText(/Upstream returned HTTP 429/).length).toBeGreaterThan(0);
    expect(screen.getByText("完整响应")).toBeInTheDocument();
  });

  test("shows historical-missing when neither output nor reconstructable details exist", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 53912,
      model: "gpt-image-2",
      input_content: '{"model":"gpt-image-2"}',
      output_content: "",
    });
    mocks.getLogContentPart.mockResolvedValue({
      id: 53912,
      model: "gpt-image-2",
      part: "details",
      content: "",
    });

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={53912} model="gpt-image-2" onClose={() => {}} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.getLogContent).toHaveBeenCalledWith(53912);
    });

    expect(await screen.findByText("该历史请求未记录上游错误响应")).toBeInTheDocument();
    expect(
      screen.getByText(
        "该历史日志未记录上游错误响应，也无法从请求详情还原失败原因。新的失败日志会保存错误详情。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("完整响应")).not.toBeInTheDocument();
  });

  test("formats and shows a real upstream error body when output exists", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 54000,
      model: "gpt-image-2",
      input_content: '{"model":"gpt-image-2"}',
      output_content: '{"error":{"message":"context canceled","type":"upstream_error"}}',
    });

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={54000} model="gpt-image-2" onClose={() => {}} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("上游 API 错误响应")).toBeInTheDocument();
    });

    expect(screen.getByText("context canceled")).toBeInTheDocument();
    expect(screen.getByText("完整响应")).toBeInTheDocument();
    expect(mocks.getLogContentPart).not.toHaveBeenCalled();
  });

  test("summarises a stream cut before its error event from the request details", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 54003,
      model: "gpt-5",
      input_content: "",
      output_content:
        'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
    });
    mocks.getLogContentPart.mockResolvedValue({
      id: 54003,
      model: "gpt-5",
      part: "details",
      content: JSON.stringify({
        diagnostic: { upstream: { status: 200, error_message: "stream disconnected before completion" } },
      }),
    });

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={54003} model="gpt-5" onClose={() => {}} />
      </ThemeProvider>,
    );

    expect(await screen.findByText("stream disconnected before completion")).toBeInTheDocument();
    expect(mocks.getLogContentPart).toHaveBeenCalledWith(54003, "details");
    // The stream itself is shown only in the full-response block.
    const streamBlocks = screen.getAllByText(/event: response\.created/);
    expect(streamBlocks).toHaveLength(1);
    expect(streamBlocks[0]?.tagName).toBe("PRE");
    expect(screen.getByText("完整响应")).toBeInTheDocument();
  });

  test("is a labelled dialog with a copy button for the full response and closes on Escape", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 54001,
      model: "gpt-5",
      input_content: "",
      output_content: '{"error":{"message":"rate limited"}}',
    });
    const onClose = vi.fn();

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={54001} model="gpt-5" onClose={onClose} />
      </ThemeProvider>,
    );

    // 通用 Modal：标题即对话框名称，Esc 走统一的叠层栈。
    const dialog = await screen.findByRole("dialog", { name: "请求失败 · gpt-5" });
    expect(await within(dialog).findByText("rate limited")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "复制完整响应" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("shows a load failure as an alert instead of an empty state", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockRejectedValue(new Error("403 forbidden"));

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={54002} onClose={() => {}} />
      </ThemeProvider>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("加载失败");
    expect(alert).toHaveTextContent("403 forbidden");
    expect(screen.queryByText("该历史请求未记录上游错误响应")).not.toBeInTheDocument();
  });
});
