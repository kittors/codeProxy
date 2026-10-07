import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ChangePasswordPage } from "../ChangePasswordPage";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  restore: vi.fn(),
  changePassword: vi.fn(),
  principal: { user: { must_change_password: false } } as {
    user: { must_change_password: boolean };
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({
    state: { principal: mocks.principal },
    actions: { restore: mocks.restore },
  }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, identityApi: { changePassword: mocks.changePassword } };
});

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/ui")>();
  return {
    ...actual,
    useToast: () => ({ notify: mocks.notify }),
    ThemeToggleButton: () => <button type="button">theme</button>,
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/change-password"]}>
      <ChangePasswordPage />
    </MemoryRouter>,
  );
}

const newPasswordInput = () =>
  screen.getByLabelText("identity_admin.new_password") as HTMLInputElement;
const confirmInput = () =>
  screen.getByLabelText("identity_admin.confirm_new_password") as HTMLInputElement;
const metRules = () =>
  within(screen.getByTestId("password-checklist"))
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("data-met") === "true").length;

describe("ChangePasswordPage", () => {
  beforeEach(() => {
    mocks.notify.mockReset();
    mocks.restore.mockReset();
    mocks.changePassword.mockReset();
    mocks.principal = { user: { must_change_password: false } };
  });

  test("ticks password rules off as the user types", () => {
    renderPage();
    expect(metRules()).toBe(0);

    fireEvent.change(newPasswordInput(), { target: { value: "abc" } });
    expect(metRules()).toBe(1);

    fireEvent.change(newPasswordInput(), { target: { value: "Correct-Horse-1!" } });
    expect(metRules()).toBe(4);
  });

  test("waits until the confirmation stops being a prefix before reporting a mismatch", async () => {
    renderPage();
    fireEvent.change(newPasswordInput(), { target: { value: "Correct-Horse-1!" } });

    fireEvent.change(confirmInput(), { target: { value: "Corr" } });
    expect(screen.queryByText("identity_admin.passwords_do_not_match")).toBeNull();

    fireEvent.change(confirmInput(), { target: { value: "Corx" } });
    expect(await screen.findByText("identity_admin.passwords_do_not_match")).toBeInTheDocument();

    fireEvent.change(confirmInput(), { target: { value: "Correct-Horse-1!" } });
    expect(await screen.findByText("identity_admin.passwords_match")).toBeInTheDocument();
  });

  test("offers a way back only when the change is voluntary", () => {
    const { unmount } = renderPage();
    expect(screen.getByRole("button", { name: "common.back" })).toBeInTheDocument();
    expect(screen.getByText("identity_admin.change_password_hint")).toBeInTheDocument();
    unmount();

    mocks.principal = { user: { must_change_password: true } };
    renderPage();
    expect(screen.queryByRole("button", { name: "common.back" })).toBeNull();
    expect(screen.getByText("identity_admin.change_password_forced_hint")).toBeInTheDocument();
  });

  test("still blocks a password that breaks the policy on submit", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("identity_admin.current_password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(newPasswordInput(), { target: { value: "alllowercase!" } });
    fireEvent.change(confirmInput(), { target: { value: "alllowercase!" } });
    fireEvent.submit(newPasswordInput().closest("form") as HTMLFormElement);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  test("submits a valid password and returns to the dashboard", async () => {
    mocks.changePassword.mockResolvedValue(undefined);
    mocks.restore.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(screen.getByLabelText("identity_admin.current_password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(newPasswordInput(), { target: { value: "Correct-Horse-1!" } });
    fireEvent.change(confirmInput(), { target: { value: "Correct-Horse-1!" } });
    fireEvent.submit(newPasswordInput().closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(mocks.changePassword).toHaveBeenCalledWith({
        current_password: "old-password",
        new_password: "Correct-Horse-1!",
      });
    });
    await waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith({
        type: "success",
        message: "identity_admin.password_changed",
      });
    });
  });
});
