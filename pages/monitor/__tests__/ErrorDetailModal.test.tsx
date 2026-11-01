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
    mocks.getLogContentPart.mockResolvedValue({ id: 54000, part: "details", content: "" });

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
    // The details are read even so: what happens next comes from their diagnostic.
    expect(mocks.getLogContentPart).toHaveBeenCalledWith(54000, "details");
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

  describe("what happened and what happens next", () => {
    const at = (second: number) => `2026-11-01T01:00:${String(second).padStart(2, "0")}Z`;

    function renderFor(logId: number, output: string, details: unknown) {
      mocks.getLogContent.mockResolvedValue({ id: logId, model: "gpt-5", output_content: output });
      mocks.getLogContentPart.mockResolvedValue({
        id: logId,
        part: "details",
        content: details === undefined ? "" : JSON.stringify(details),
      });
      render(
        <ThemeProvider>
          <ErrorDetailModal open logId={logId} model="gpt-5" onClose={() => {}} />
        </ThemeProvider>,
      );
    }

    test("an attempt the upstream rate-limited says where the request went next", async () => {
      await i18n.changeLanguage("zh-CN");
      renderFor(
        61001,
        '{"error":{"message":"Rate limit reached","type":"rate_limit_error"}}',
        {
          diagnostic: {
            upstream: { status: 429 },
            route_trace: {
              steps: [
                {
                  kind: "attempt",
                  at: at(0),
                  attempt: 1,
                  auth_id: "a",
                  auth_label: "acc-a",
                  outcome: "failed",
                  status: 429,
                  cause: "rate_limited",
                },
                { kind: "attempt", at: at(1), attempt: 2, auth_id: "b", auth_label: "acc-b" },
              ],
            },
          },
        },
      );

      const next = await screen.findByRole("region", { name: "接下来会怎样" });
      expect(screen.getByText("上游限流")).toBeInTheDocument();
      expect(screen.getByText("Rate limit reached")).toBeInTheDocument();
      expect(next).toHaveTextContent("请求换到了 acc-b。");
      // The trace already says the request moved on: no general word on recovery.
      expect(next).not.toHaveTextContent("到点自动恢复");
      expect(screen.getByText("上游 API 错误响应")).toBeInTheDocument();
    });

    test("a key's daily limit is the gateway's answer and says when it recovers", async () => {
      await i18n.changeLanguage("zh-CN");
      const body =
        '{"error":{"message":"Daily request limit exceeded: 100/100 requests used today.","type":"rate_limit_exceeded","code":"daily_limit_exceeded"}}';
      renderFor(61002, body, {
        diagnostic: {
          quota: { rejected: true, rejected_by: "daily", error_code: "daily_limit_exceeded" },
          response: { status: 429, error_code: "daily_limit_exceeded", source: "local_quota" },
        },
      });

      expect(await screen.findByText("Key 触到了限额")).toBeInTheDocument();
      expect(
        screen.getByText("下一个项目日开始时自动恢复；等不了时，调高每日上限或重置今日额度。"),
      ).toBeInTheDocument();
      expect(screen.getByText("网关的错误响应")).toBeInTheDocument();
    });

    test("a canceled request with no body says nothing was retried", async () => {
      await i18n.changeLanguage("zh-CN");
      renderFor(61003, "", { diagnostic: { response: { status: 499 } } });

      expect(await screen.findByText("客户端取消了请求")).toBeInTheDocument();
      expect(
        screen.getByText("客户端在回复完成前断开了连接，网关随即停止：没有再请求上游，也不会重试。"),
      ).toBeInTheDocument();
      expect(screen.queryByText("该历史请求未记录上游错误响应")).not.toBeInTheDocument();
      expect(screen.queryByText("完整响应")).not.toBeInTheDocument();
    });

    test("speaks the panel's language", async () => {
      await i18n.changeLanguage("en");
      renderFor(61004, '{"error":{"message":"Loop detected"}}', {
        diagnostic: { loop_guard: { kind: "tool_loop", source: "api_key" } },
      });

      expect(await screen.findByText("Loop protection stopped a tool-call loop")).toBeInTheDocument();
      expect(
        screen.getByText(
          "If it was not a loop, raise the thresholds or turn the check off in this key's loop protection settings.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "What happens next" })).toBeInTheDocument();
    });

    test("shows the error at once and what happens next once the details arrive", async () => {
      await i18n.changeLanguage("zh-CN");
      let sendDetails: (value: { id: number; part: string; content: string }) => void = () => {};
      mocks.getLogContent.mockResolvedValue({
        id: 61005,
        model: "gpt-5",
        output_content: '{"error":{"message":"Overloaded","type":"overloaded_error"}}',
      });
      mocks.getLogContentPart.mockReturnValue(
        new Promise((resolve) => {
          sendDetails = resolve;
        }),
      );
      render(
        <ThemeProvider>
          <ErrorDetailModal open logId={61005} model="gpt-5" onClose={() => {}} />
        </ThemeProvider>,
      );

      expect(await screen.findByText("Overloaded")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "接下来会怎样" })).not.toBeInTheDocument();

      sendDetails({
        id: 61005,
        part: "details",
        content: JSON.stringify({ diagnostic: { upstream: { status: 529 } } }),
      });
      const next = await screen.findByRole("region", { name: "接下来会怎样" });
      expect(next).toHaveTextContent("通常是上游的临时故障，过一会儿会自己恢复。");
      expect(screen.getByText("上游服务出错")).toBeInTheDocument();
    });
  });
});
