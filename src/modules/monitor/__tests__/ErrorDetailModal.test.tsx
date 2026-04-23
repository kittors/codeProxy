import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLogContent: vi.fn(),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    usageApi: {
      ...mod.usageApi,
      getLogContent: mocks.getLogContent,
    },
  };
});

import i18n from "@/i18n";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

describe("ErrorDetailModal", () => {
  afterEach(async () => {
    cleanup();
    mocks.getLogContent.mockReset();
    await i18n.changeLanguage("zh-CN");
  });

  test("shows a historical-missing hint when an old failed log has no upstream error body", async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getLogContent.mockResolvedValue({
      id: 53912,
      model: "gpt-image-2",
      input_content: '{"model":"gpt-image-2"}',
      output_content: "",
    });

    render(
      <ThemeProvider>
        <ErrorDetailModal open logId={53912} model="gpt-image-2" onClose={() => {}} />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.getLogContent).toHaveBeenCalledWith(53912);
    });

    expect(
      screen.getByText("No upstream error response was recorded for this historical request"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No upstream error response was recorded for this historical log, so the original upstream failure cannot be reconstructed. New failed logs will store the actual error details.",
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
  });
});
