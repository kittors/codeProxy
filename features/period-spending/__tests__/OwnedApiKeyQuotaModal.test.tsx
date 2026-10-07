import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { OwnedApiKeyQuotaModal, type OwnedApiKeyQuotaForm } from "../OwnedApiKeyQuotaModal";
import { emptyPeriodSpendingDraft } from "../PeriodSpendingFields";

function Harness({
  onSubmit,
  existingNames,
  serverError,
}: {
  onSubmit: () => void;
  existingNames?: string[];
  serverError?: string;
}) {
  const [value, setValue] = useState<OwnedApiKeyQuotaForm>({
    name: "",
    periods: emptyPeriodSpendingDraft(),
  });
  return (
    <OwnedApiKeyQuotaModal
      t={i18n.t.bind(i18n)}
      open
      mode="create"
      value={value}
      accountLimits={{ "5h": 0, day: 300, week: 0, month: 0 }}
      saving={false}
      serverError={serverError}
      existingNames={existingNames}
      onChange={setValue}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

describe("OwnedApiKeyQuotaModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("blocks an empty name in place instead of greying out the button", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    const dialog = screen.getByRole("dialog", { name: "Create key" });
    const create = within(dialog).getByRole("button", { name: "Create" });
    expect(create).toBeEnabled();
    await userEvent.click(create);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Required")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("flags a period above the account ceiling and a duplicate name", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} existingNames={["Primary"]} />);

    const dialog = screen.getByRole("dialog", { name: "Create key" });
    // 账号上限常驻在输入框下方。
    expect(within(dialog).getByText("Account limit $300")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole("textbox", { name: "Name" }), " primary ");
    const day = within(dialog).getByRole("spinbutton", { name: "Daily quota (USD)" });
    await userEvent.type(day, "500");
    await userEvent.tab();
    expect(within(dialog).getByText("Can't exceed the account limit of $300")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(within(dialog).getByText("That name is already taken")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.clear(day);
    await userEvent.type(day, "200");
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Laptop");
    // 提交按钮在尾部（form 属性关联），jsdom 的回车隐式提交找不到它，这里直接点按钮。
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("shows the server's rejection as an alert inside the form", () => {
    render(<Harness onSubmit={vi.fn()} serverError="Key quota exceeds account quota" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Key quota exceeds account quota");
  });
});
