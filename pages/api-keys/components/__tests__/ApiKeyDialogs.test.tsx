import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiKeyFormModal } from "../ApiKeyFormModal";
import { DeleteApiKeyModal } from "../DeleteApiKeyModal";
import { makeEmptyApiKeyForm } from "../../apiKeyPageUtils";
import type { ApiKeyFormValues } from "../../types";

const t = i18n.t.bind(i18n);

function FormHarness({
  editMode,
  initial,
  onSubmit,
}: {
  editMode: boolean;
  initial: ApiKeyFormValues;
  onSubmit: () => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  return (
    <ApiKeyFormModal
      t={t}
      open
      editMode={editMode}
      saving={false}
      form={form}
      setForm={setForm}
      originalKey={editMode ? initial.key : undefined}
      permissionProfileOptions={[{ value: "", label: "Default: unrestricted" }]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      regenerateKey={() => setForm((prev) => ({ ...prev, key: "sk-regenerated" }))}
    />
  );
}

describe("API key dialogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("create: an empty name is flagged on the field, not in a toast", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<FormHarness editMode={false} initial={makeEmptyApiKeyForm("sk-new")} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog", { name: "Create API Key" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(within(dialog).getByText("Required")).toBeInTheDocument();
  });

  test("edit: changing the key value spells out that the old key stops working", async () => {
    render(
      <FormHarness
        editMode
        initial={{ ...makeEmptyApiKeyForm("sk-original"), name: "Team" }}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Edit API Key" });
    expect(within(dialog).queryByText(/old key stops working/i)).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Refresh Key" }));
    expect(within(dialog).getByRole("textbox", { name: "API key" })).toHaveValue("sk-regenerated");
    expect(within(dialog).getByText(/old key stops working/i)).toBeInTheDocument();
  });

  test("delete shows the key card and the destructive log option only where it applies", async () => {
    const onDeleteLogsChange = vi.fn();
    const entry = { key: "sk-team-a-1234567890", name: "Team A" };
    const { rerender } = render(
      <DeleteApiKeyModal
        t={t}
        entry={entry}
        open
        saving={false}
        deleteLogsOnDelete={false}
        onDeleteLogsChange={onDeleteLogsChange}
        onClose={vi.fn()}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete API key" });
    expect(within(dialog).getByText("Team A")).toBeInTheDocument();
    expect(within(dialog).getByText(/^sk-te•+890$/)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Also clear historical request records for this API key",
      }),
    );
    expect(onDeleteLogsChange).toHaveBeenCalledWith(true);

    // 账号名下的 Key 走账号接口删除，不处理日志：不显示这个选项。
    rerender(
      <DeleteApiKeyModal
        t={t}
        entry={entry}
        open
        saving={false}
        deleteLogsOnDelete={false}
        onDeleteLogsChange={onDeleteLogsChange}
        allowDeleteLogs={false}
        onClose={vi.fn()}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("cancel is disabled while the delete is in flight", () => {
    render(
      <DeleteApiKeyModal
        t={t}
        entry={{ key: "sk-team-a-1234567890", name: "Team A" }}
        open
        saving
        deleteLogsOnDelete
        onDeleteLogsChange={vi.fn()}
        onClose={vi.fn()}
        onConfirm={vi.fn(async () => undefined)}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete API key" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /confirm delete/i })).toBeDisabled();
  });
});
