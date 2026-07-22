import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { describe, expect, test, vi } from "vitest";
import { TableRowActions, type TableRowAction } from "../TableRowActions";

const createActions = (): TableRowAction[] => [
  { key: "view", label: "View", icon: <Eye data-testid="view-icon" />, onClick: vi.fn() },
  { key: "copy", label: "Copy", icon: <Copy data-testid="copy-icon" />, onClick: vi.fn() },
  { key: "edit", label: "Edit", icon: <Pencil data-testid="edit-icon" />, onClick: vi.fn() },
  {
    key: "delete",
    label: "Delete",
    icon: <Trash2 data-testid="delete-icon" />,
    onClick: vi.fn(),
    destructive: true,
  },
];

describe("TableRowActions", () => {
  test("renders up to three visible actions inline without an overflow menu", () => {
    render(<TableRowActions actions={createActions().slice(0, 3)} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  test("keeps the first three actions inline and renders the tail as icon and label menu items", async () => {
    const actions = createActions();
    render(<TableRowActions actions={actions} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    const deleteItem = await screen.findByRole("menuitem", { name: "Delete" });
    expect(within(deleteItem).getByTestId("delete-icon")).toBeInTheDocument();
    expect(deleteItem).toHaveTextContent("Delete");
    await userEvent.click(deleteItem);
    expect(actions[3]?.onClick).toHaveBeenCalledTimes(1);
  });

  test("filters hidden actions before deciding whether overflow is needed", () => {
    const actions = createActions();
    actions[1] = { ...actions[1]!, visible: false };

    render(<TableRowActions actions={actions} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
  });

  test("keeps disabled overflow actions disabled", async () => {
    const actions = createActions();
    actions[3] = { ...actions[3]!, disabled: true };
    render(<TableRowActions actions={actions} moreLabel="More actions" />);

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "data-disabled",
    );
  });
});
