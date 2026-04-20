import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ToastProvider, useToast } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock("goey-toast", () => ({
  GoeyToaster: () => null,
  goeyToast: {
    info: mocks.info,
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error,
  },
}));

function Trigger() {
  const { notify } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          notify({
            type: "warning",
            message: "line 1\nline 2",
          })
        }
      >
        Notify
      </button>
      <button
        type="button"
        onClick={() =>
          notify({
            type: "warning",
            message:
              'service update check degraded: github commit status 403: {"documentation_url":"https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"}',
            classNames: {
              actionWrapper: "custom-action-wrapper",
            },
          })
        }
      >
        Notify Long
      </button>
    </>
  );
}

describe("ToastProvider", () => {
  test("puts multiline messages in the toast description body", () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));

    expect(mocks.warning).toHaveBeenCalledWith(
      "Warning",
      expect.objectContaining({
        description: "line 1\nline 2",
        classNames: expect.objectContaining({
          description: expect.stringContaining("whitespace-pre-line"),
        }),
      }),
    );
  });

  test("constrains long toast messages without dropping caller class names", () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify Long" }));

    expect(mocks.warning).toHaveBeenCalledWith(
      "Warning",
      expect.objectContaining({
        description: expect.stringContaining("github commit status 403"),
        classNames: expect.objectContaining({
          wrapper: expect.stringContaining("max-w"),
          content: expect.stringContaining("min-w-0"),
          header: expect.stringContaining("min-w-0"),
          title: expect.stringContaining("overflow-wrap:anywhere"),
          actionWrapper: "custom-action-wrapper",
        }),
      }),
    );
  });
});
