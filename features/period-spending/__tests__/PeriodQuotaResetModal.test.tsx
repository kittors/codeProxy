import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { PeriodQuotaResetModal } from "../PeriodQuotaResetModal";

describe("PeriodQuotaResetModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("uses direct confirmation when exactly one period is configured", async () => {
    const onConfirm = vi.fn();
    render(
      <PeriodQuotaResetModal
        open
        scope="account"
        subjectName="Alice"
        configuredLimits={{ "5h": 0, day: 100, week: 0, month: 0 }}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Reset account quota" });
    expect(within(dialog).getByText(/account Alice/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/current Day usage/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset quota" }));

    expect(onConfirm).toHaveBeenCalledWith(["day"]);
  });

  test("requires selecting configured periods when multiple periods are available", async () => {
    const onConfirm = vi.fn();
    render(
      <PeriodQuotaResetModal
        open
        scope="key"
        subjectName="Primary"
        configuredLimits={{ "5h": 50, day: 100, week: 300, month: 0 }}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Reset Key quota" });
    const confirm = within(dialog).getByRole("button", { name: "Reset selected quotas" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).queryByRole("checkbox", { name: /Month/ })).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reset Day quota" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Reset Week quota" }));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(["day", "week"]);
  });

  test("renders no reset flow when no period quota is configured", () => {
    const onConfirm = vi.fn();
    render(
      <PeriodQuotaResetModal
        open
        scope="key"
        subjectName="Unlimited"
        configuredLimits={{ "5h": 0, day: 0, week: 0, month: 0 }}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("PeriodQuotaResetModal lifetime allowance", () => {
  test("an account with only a lifetime allowance can still be granted again", async () => {
    // Granting a fresh allowance is the only way to make a spent-out account
    // usable again, so the dialog must offer it even with no rolling periods.
    const onConfirm = vi.fn();
    render(
      <PeriodQuotaResetModal
        open
        scope="account"
        subjectName="Kittors"
        lifetimeLimit={1000}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Reset account quota" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset quota" }));
    expect(onConfirm).toHaveBeenCalledWith(["lifetime"]);
  });

  test("no allowance configured means nothing to grant", () => {
    const { container } = render(
      <PeriodQuotaResetModal
        open
        scope="account"
        subjectName="Kittors"
        lifetimeLimit={0}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
