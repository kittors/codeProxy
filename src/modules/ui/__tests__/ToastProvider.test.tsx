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

const expectClassNameToInclude = (value: unknown, className: string) => {
  expect(value).toEqual(expect.any(String));
  expect(String(value)).toContain(className);
};

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

    const [, options] = mocks.warning.mock.calls.at(-1) ?? [];

    expect(mocks.warning).toHaveBeenCalledWith("Warning", expect.any(Object));
    expect(options).toEqual(
      expect.objectContaining({
        description: "line 1\nline 2",
        classNames: expect.any(Object),
      }),
    );
    expectClassNameToInclude(options?.classNames?.title, "whitespace-nowrap");
    expectClassNameToInclude(options?.classNames?.description, "whitespace-pre-line");
  });

  test("keeps toast titles single-line while moving long content into the description body", () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <Trigger />
        </ToastProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify Long" }));

    const [, options] = mocks.warning.mock.calls.at(-1) ?? [];

    expect(mocks.warning).toHaveBeenCalledWith("Warning", expect.any(Object));
    expect(options).toEqual(
      expect.objectContaining({
        description: expect.stringContaining("github commit status 403"),
        classNames: expect.any(Object),
      }),
    );
    expectClassNameToInclude(options?.classNames?.wrapper, "max-w");
    expectClassNameToInclude(options?.classNames?.content, "min-w-0");
    expectClassNameToInclude(options?.classNames?.header, "min-w-0");
    expectClassNameToInclude(options?.classNames?.title, "truncate");
    expectClassNameToInclude(options?.classNames?.title, "whitespace-nowrap");
    expectClassNameToInclude(options?.classNames?.description, "overflow-wrap:anywhere");
    expect(options?.classNames?.actionWrapper).toBe("custom-action-wrapper");
  });
});
