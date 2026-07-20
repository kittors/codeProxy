import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "../LoginPage";

const toastMocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  switchAccount: vi.fn(),
  removeSavedAccount: vi.fn(),
  state: {
    isAuthenticated: false,
    isRestoring: false,
    apiBase: "http://localhost:8317",
    rememberPassword: false,
    principal: null,
    authFailureCode: "",
    savedAccounts: [] as Array<{
      accountId: string;
      username: string;
      displayName: string;
    }>,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({
    state: authMocks.state,
    actions: {
      login: authMocks.login,
      switchAccount: authMocks.switchAccount,
      removeSavedAccount: authMocks.removeSavedAccount,
    },
  }),
}));

vi.mock("@code-proxy/ui", () => ({
  PageBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  useToast: () => toastMocks,
}));

vi.mock("@code-proxy/assets", () => ({
  OpenAILogo: () => null,
  GeminiLogo: () => null,
  ClaudeLogo: () => null,
  VertexLogo: () => null,
}));

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
