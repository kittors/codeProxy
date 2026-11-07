import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { OwnedApiKeyQuotaModal, type OwnedApiKeyQuotaForm } from "../OwnedApiKeyQuotaModal";
import { emptyPeriodSpendingDraft } from "../PeriodSpendingFields";

// The page can append sections that belong to other features and save them before the
// key itself; the modal does not know what they are.

function Harness({
  name = "Laptop",
  onSubmit,
  beforeSubmit,
  withExtra = true,
}: {
  name?: string;
  onSubmit: () => void;
  beforeSubmit?: () => Promise<boolean>;
  withExtra?: boolean;
}) {
  const [value, setValue] = useState<OwnedApiKeyQuotaForm>({
    name,
    periods: emptyPeriodSpendingDraft(),
  });
  return (
    <OwnedApiKeyQuotaModal
      t={i18n.t.bind(i18n)}
      open
      mode="edit"
      value={value}
      accountLimits={{ "5h": 0, day: 0, week: 0, month: 0 }}
      saving={false}
      extra={withExtra ? <p>an extra section</p> : undefined}
      beforeSubmit={beforeSubmit}
      onChange={setValue}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Edit Key quota" });
const save = () => within(dialog()).getByRole("button", { name: "Save" });

describe("OwnedApiKeyQuotaModal extra sections", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows what the page appends, after the quota fields", () => {
    render(<Harness onSubmit={vi.fn()} />);
    const extra = within(dialog()).getByText("an extra section");
    const quota = within(dialog()).getByText("Key sub-quota");
    expect(quota.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("without anything appended the dialog saves as it always did", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} withExtra={false} />);
    expect(within(dialog()).queryByText("an extra section")).toBeNull();
    await userEvent.click(save());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("the key is saved after the page's own save has gone through", async () => {
    const order: string[] = [];
    const beforeSubmit = vi.fn(async () => {
      order.push("extra");
      return true;
    });
    const onSubmit = vi.fn(() => {
      order.push("key");
    });
    render(<Harness onSubmit={onSubmit} beforeSubmit={beforeSubmit} />);

    await userEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["extra", "key"]);
  });

  test("when the page's save says no, the key is not saved and the dialog stays", async () => {
    const onSubmit = vi.fn();
    const beforeSubmit = vi.fn(async () => false);
    render(<Harness onSubmit={onSubmit} beforeSubmit={beforeSubmit} />);

    await userEvent.click(save());
    await waitFor(() => expect(beforeSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  test("the key's own validation comes first: nothing of the page is saved for an empty name", async () => {
    const onSubmit = vi.fn();
    const beforeSubmit = vi.fn(async () => true);
    render(<Harness name="" onSubmit={onSubmit} beforeSubmit={beforeSubmit} />);

    await userEvent.click(save());
    expect(within(dialog()).getByText("Required")).toBeInTheDocument();
    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
