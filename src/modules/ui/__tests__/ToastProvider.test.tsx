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
  );
}

describe("ToastProvider", () => {
  test("passes multiline-friendly class names to goey-toast", () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));

    expect(mocks.warning).toHaveBeenCalledWith(
      "line 1\nline 2",
      expect.objectContaining({
        classNames: expect.objectContaining({
          title: expect.stringContaining("whitespace-pre-line"),
        }),
      }),
    );
  });
});
