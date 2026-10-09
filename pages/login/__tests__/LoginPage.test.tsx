import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../LoginPage";

const toastMocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  state: {
    isAuthenticated: false,
    isRestoring: false,
    apiBase: "http://localhost:8317",
    rememberPassword: false,
    principal: null,
    authFailureCode: "",
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Interpolation values are appended so assertions can see the numbers the
    // page passed (remaining attempts, countdown); string defaults are ignored.
    t: (key: string, options?: unknown) =>
      options && typeof options === "object" ? `${key}${JSON.stringify(options)}` : key,
  }),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({
    state: authMocks.state,
    actions: {
      login: authMocks.login,
    },
  }),
}));

vi.mock("@code-proxy/ui", () => ({
  PageBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Callout: ({ children, role }: { children?: React.ReactNode; role?: "alert" | "status" }) => (
    <div role={role}>{children}</div>
  ),
  Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TextInput: ({
    value,
    onChange,
    type,
    autoFocus,
    startAdornment,
    endAdornment,
    className,
    autoComplete,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    autoFocus?: boolean;
    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
    className?: string;
    autoComplete?: string;
  }) => (
    <div>
      {startAdornment}
      <input
        value={value}
        onChange={onChange}
        type={type}
        autoFocus={autoFocus}
        className={className}
        autoComplete={autoComplete}
      />
      {endAdornment}
    </div>
  ),
  ThemeToggleButton: () => <button type="button">theme</button>,
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
  Button: ({
    children,
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => (
    <button {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}>
      {children}
    </button>
  ),
  useToast: () => toastMocks,
  // 动效与键盘状态钩子：这里只测提交流程，给出不带副作用的替身。
  useCapsLock: () => ({ capsLock: false, onKeyDown: () => {}, onKeyUp: () => {}, onBlur: () => {} }),
  useShake: () => ({ controls: undefined, shake: () => {} }),
  useStaggerVariants: () => ({ container: {}, item: {} }),
}));

// 品牌名常量走真实导出，避免 mock 漂移后测试仍然「通过」却断言了错误的品牌。
vi.mock("@code-proxy/assets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/assets")>();
  return {
    ...actual,
    OpenAILogo: () => null,
    GeminiLogo: () => null,
    ClaudeLogo: () => null,
    VertexLogo: () => null,
  };
});

vi.mock("@code-proxy/api-client", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/api-client")>(
    "@code-proxy/api-client",
  );
  return {
    ...actual,
    detectApiBaseFromLocation: () => "http://localhost:8317",
  };
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage toasts", () => {
  beforeEach(() => {
    toastMocks.notify.mockReset();
    authMocks.login.mockReset();
    authMocks.state.isAuthenticated = false;
    authMocks.state.isRestoring = false;
    authMocks.state.authFailureCode = "";
  });

  test("shows username required toast when username is empty", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "login.submit_button" }));
    expect(toastMocks.notify).toHaveBeenCalledWith({
      type: "error",
      message: "login.error_username_required",
    });
    expect(authMocks.login).not.toHaveBeenCalled();
  });

  test("shows password required toast when password is empty", async () => {
    renderLogin();
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "login.submit_button" }));
    expect(toastMocks.notify).toHaveBeenCalledWith({
      type: "error",
      message: "login.error_password_required",
    });
    expect(authMocks.login).not.toHaveBeenCalled();
  });

  test("shows invalid credentials toast on 401 login failure", async () => {
    const { ApiError } = await import("@code-proxy/api-client");
    authMocks.login.mockRejectedValue(
      new ApiError({
        message: "invalid credentials",
        status: 401,
        payload: { error: { code: "invalid_credentials", message: "invalid credentials" } },
      }),
    );
    renderLogin();
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, {
      target: { value: "admin" },
    });
    fireEvent.change(
      document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement,
      { target: { value: "wrong" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "login.submit_button" }));

    await waitFor(() => {
      expect(toastMocks.notify).toHaveBeenCalledWith({
        type: "error",
        message: "login.error_invalid_credentials",
      });
    });
  });

  test("shows success toast on successful login", async () => {
    authMocks.login.mockResolvedValue({
      user: { must_change_password: false },
    });
    renderLogin();
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, {
      target: { value: "admin" },
    });
    fireEvent.change(
      document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement,
      { target: { value: "secret" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "login.submit_button" }));

    await waitFor(() => {
      expect(toastMocks.notify).toHaveBeenCalledWith({
        type: "success",
        message: "login.login_success",
      });
    });
  });
});

function fillAndSubmit(username: string, password: string) {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, {
    target: { value: username },
  });
  fireEvent.change(
    document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement,
    { target: { value: password } },
  );
  fireEvent.click(screen.getByRole("button", { name: "login.submit_button" }));
}

describe("LoginPage attempt limits", () => {
  beforeEach(() => {
    toastMocks.notify.mockReset();
    authMocks.login.mockReset();
    authMocks.state.isAuthenticated = false;
    authMocks.state.isRestoring = false;
    authMocks.state.authFailureCode = "";
  });

  // Reported: a wrong password never said how many tries were left, so people
  // only learned there was a limit by being locked out.
  test("says how many attempts remain, in the toast and on the form", async () => {
    const { ApiError } = await import("@code-proxy/api-client");
    authMocks.login.mockRejectedValue(
      new ApiError({
        message: "invalid credentials",
        status: 401,
        payload: {
          error: {
            code: "invalid_credentials",
            message: "invalid credentials",
            details: { remaining_attempts: 2 },
          },
        },
      }),
    );
    renderLogin();
    fillAndSubmit("admin", "wrong");

    await waitFor(() => {
      expect(toastMocks.notify).toHaveBeenCalledWith({
        type: "error",
        message: 'login.error_invalid_credentials_remaining{"count":2}',
      });
    });
    // The toast fades; the warning stays on the form.
    expect(screen.getByText('login.remaining_attempts_notice{"count":2}')).toBeInTheDocument();
  });

  // Reported: once locked, the page said only "try again later", so people kept
  // submitting — every attempt looked like one more wrong password.
  test("counts a reported lock down with sign-in disabled, then lets the user back in", async () => {
    const { ApiError } = await import("@code-proxy/api-client");
    authMocks.login.mockRejectedValue(
      new ApiError({
        message: "too many login attempts",
        status: 429,
        payload: {
          error: {
            code: "login_rate_limited",
            message: "too many login attempts",
            details: { retry_after_seconds: 1 },
          },
        },
      }),
    );
    renderLogin();
    fillAndSubmit("admin", "wrong");

    await screen.findByText('login.locked_notice{"time":"0:01"}');
    // The toast states the lock once; the form keeps counting it down.
    expect(toastMocks.notify).toHaveBeenCalledWith({
      type: "error",
      message: 'login.error_rate_limited_seconds{"count":1,"seconds":1}',
    });
    const submit = screen.getByRole("button", { name: "login.submit_button" });
    expect(submit).toBeDisabled();

    // Enter in a field cannot slip past the lock either.
    fireEvent.submit(submit.closest("form") as HTMLFormElement);
    expect(authMocks.login).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(submit).not.toBeDisabled(), { timeout: 3_000 });
    // The notice leaves with its exit animation once the lock has lapsed.
    await waitFor(() => expect(screen.queryByText(/login\.locked_notice/)).toBeNull());
  });

  test("a lock on one account does not block signing in to another", async () => {
    const { ApiError } = await import("@code-proxy/api-client");
    authMocks.login.mockRejectedValue(
      new ApiError({
        message: "login cooldown",
        status: 429,
        payload: {
          error: {
            code: "login_cooldown",
            message: "login cooldown: retry after 5m0s",
            details: { retry_after_seconds: 300 },
          },
        },
      }),
    );
    renderLogin();
    fillAndSubmit("admin", "wrong");

    await screen.findByText(/login\.locked_notice/);
    const submit = screen.getByRole("button", { name: "login.submit_button" });
    expect(submit).toBeDisabled();

    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, {
      target: { value: "operator" },
    });
    expect(submit).not.toBeDisabled();
    await waitFor(() => expect(screen.queryByText(/login\.locked_notice/)).toBeNull());
  });
});
