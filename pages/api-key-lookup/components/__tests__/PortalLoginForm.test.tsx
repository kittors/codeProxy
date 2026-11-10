import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { LoginFailure } from "@features/login-lock";
import { PortalLoginForm } from "../PortalLoginForm";

const t = i18n.t.bind(i18n);

function Harness({ error, onSubmit }: { error: LoginFailure | null; onSubmit: () => void }) {
  const [username, setUsername] = useState("lockout_pg");
  const [password, setPassword] = useState("secret");
  return (
    <PortalLoginForm
      t={t}
      username={username}
      password={password}
      showPassword={false}
      error={error}
      busy={false}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onTogglePassword={() => {}}
      onSubmit={onSubmit}
    />
  );
}

const signInButton = () => screen.getByRole("button", { name: "Login" });

describe("PortalLoginForm attempt limits", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows the remaining attempts the server reported", () => {
    render(
      <Harness
        error={{
          message: "Incorrect username or password. 2 attempts left.",
          remainingAttempts: 2,
          username: "lockout_pg",
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("2 attempts left");
    expect(signInButton()).not.toBeDisabled();
  });

  // Reported: "try again in 1 minute" stayed on screen as static text and the
  // button stayed live, so people kept submitting into the lock.
  test("counts a lock down with sign-in disabled until it lapses", async () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        error={{
          message:
            "Too many failed attempts. Sign-in is temporarily locked; try again in 1 second.",
          lockedUntil: Date.now() + 1_000,
          username: "lockout_pg",
        }}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("try again in 0:01");
    expect(signInButton()).toBeDisabled();

    // Enter in a field cannot slip past the lock either.
    fireEvent.submit(signInButton().closest("form") as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => expect(signInButton()).not.toBeDisabled(), { timeout: 3_000 });
    // "Try again in 1 minute" is stale once the lock is over; it goes away.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  test("a lock on another account leaves this one alone", () => {
    render(
      <Harness
        error={{
          message: "Too many failed attempts.",
          lockedUntil: Date.now() + 60_000,
          username: "someone_else",
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(signInButton()).not.toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// Reported: a portal user who had changed their password months earlier only
// ever saw "incorrect username or password" and kept retrying, with no idea an
// admin could reset it. The portal has no self-service recovery, so the form
// says where to go instead.
describe("PortalLoginForm password recovery hint", () => {
  const hint = "Forgot your password? Ask your admin to reset it.";

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("tells people who forgot their password to ask an admin", () => {
    render(<Harness error={null} onSubmit={vi.fn()} />);
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  test("sits beside a failure without being announced a second time", () => {
    render(
      <Harness
        error={{
          message: "Incorrect username or password. 4 attempts left.",
          remainingAttempts: 4,
          username: "lockout_pg",
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(hint).closest('[role="alert"], [role="status"], [aria-live]')).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
