import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { QuotaPage } from "@/modules/quota/QuotaPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  downloadText: vi.fn(),
  request: vi.fn(),
  reconcile: vi.fn(),
  getApiCallErrorMessage: vi.fn((result: { statusCode?: number }) => `HTTP ${result.statusCode ?? 0}`),
}));

vi.mock("@/lib/http/apis", () => ({
  authFilesApi: {
    list: mocks.list,
    downloadText: mocks.downloadText,
  },
  apiCallApi: {
    request: mocks.request,
  },
  quotaApi: {
    reconcile: mocks.reconcile,
  },
  getApiCallErrorMessage: mocks.getApiCallErrorMessage,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeCodexResult(usedPercent: number) {
  const body = {
    rate_limit: {
      primary_window: {
        used_percent: usedPercent,
        limit_window_seconds: 18000,
        reset_after_seconds: 1800,
      },
    },
  };

  return {
    statusCode: 200,
    header: {},
    body,
    bodyText: JSON.stringify(body),
  };
}

describe("QuotaPage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.list.mockReset();
    mocks.downloadText.mockReset();
    mocks.request.mockReset();
    mocks.reconcile.mockReset();
    mocks.getApiCallErrorMessage.mockClear();
  });

  test("preserves existing quota rows while a card refresh is in flight", async () => {
    await i18n.changeLanguage("en");

    const secondRequest = deferred<ReturnType<typeof makeCodexResult>>();

    mocks.list.mockResolvedValue({
      files: [
        {
          name: "codex.json",
          provider: "codex",
          authIndex: "1",
          id_token: JSON.stringify({ chatgpt_account_id: "acct_123" }),
        },
      ],
    });
    mocks.request
      .mockResolvedValueOnce(makeCodexResult(10))
      .mockImplementationOnce(() => secondRequest.promise);
    mocks.reconcile.mockResolvedValue({ status: "ok", changed: true });

    render(
      <ThemeProvider>
        <ToastProvider>
          <QuotaPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("90%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Refresh codex.json" }));

    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    secondRequest.resolve(makeCodexResult(27));

    await waitFor(() => {
      expect(screen.getByText("73%")).toBeInTheDocument();
    });

    expect(mocks.reconcile).toHaveBeenCalledWith("1");
  });
});
