import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { describe, expect, test, vi } from "vitest";
import { TABLE_ROW_ACTIONS_COLUMN, TableRowActions, type TableRowAction } from "../TableRowActions";

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

  test("never puts more than four buttons in the fixed-width column, whatever a page asks for", () => {
    const actions = [
      ...createActions(),
      { key: "share", label: "Share", icon: <Copy />, onClick: vi.fn() },
    ];
    // 五个操作、页面要求全部平铺：列宽只放得下四个位置，平铺三个、其余进「更多」。
    render(<TableRowActions actions={actions} maxInline={5} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });

  test("lays out four actions inline when the page allows four", () => {
    render(<TableRowActions actions={createActions()} maxInline={4} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  test("draws every action as the same ghost button, with danger only changing the colour", () => {
    render(<TableRowActions actions={createActions().slice(0, 4)} maxInline={4} moreLabel="More actions" />);

    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      // 同一尺寸、同一形状：图标按钮统一 h-7 w-7 胶囊，图标统一按 1rem 画。
      expect(button).toHaveClass("h-7", "w-7", "rounded-full", "[&_svg]:size-4");
      // 没有哪个按钮带描边轮廓（default 变体的 shadow-control）。
      expect(button.className).not.toMatch(/shadow-control/);
    }
    expect(screen.getByRole("button", { name: "Delete" }).className).toMatch(/text-rose-600/);
    expect(screen.getByRole("button", { name: "Edit" }).className).not.toMatch(/text-rose-600/);
  });

  test("uses the tooltip only for the hover hint and keeps the label as the accessible name", () => {
    render(
      <TableRowActions
        actions={[{ key: "check", label: "Check proxy A", tooltip: "Overridden, cannot check", icon: <Eye />, onClick: vi.fn() }]}
      />,
    );

    expect(screen.getByRole("button", { name: "Check proxy A" })).toBeInTheDocument();
  });

  test("the shared column centres its header, the same way the buttons are centred", () => {
    expect(TABLE_ROW_ACTIONS_COLUMN.headerClassName).toBe("text-center");
    render(<TableRowActions actions={createActions().slice(0, 2)} />);
    expect(screen.getByRole("button", { name: "View" }).parentElement).toHaveClass("justify-center", "w-full");
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
  test("keeps a row's unavailable actions as empty slots so the rest stay in place", () => {
    const actions = createActions().map((action) =>
      action.key === "view" ? action : { ...action, unavailable: true },
    );
    const { container } = render(<TableRowActions actions={actions} moreLabel="More actions" />);

    // Same four places as a row that can do everything: View, two empty inline slots, an empty
    // "More". The tenants page used to centre a lone View button away from the other rows' one.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(container.querySelectorAll("span.h-7.w-7[aria-hidden='true']")).toHaveLength(3);
  });

  test("leaves an unavailable action out of the menu and keeps the menu's place empty", () => {
    const actions = createActions().map((action) =>
      action.key === "delete" ? { ...action, unavailable: true } : action,
    );
    const { container } = render(<TableRowActions actions={actions} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(container.querySelectorAll("span.h-7.w-7[aria-hidden='true']")).toHaveLength(1);
  });

  test("visible: false still takes no place at all (the whole column lacks it)", () => {
    const actions = createActions().map((action) =>
      action.key === "view" ? action : { ...action, visible: false },
    );
    const { container } = render(<TableRowActions actions={actions} moreLabel="More actions" />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(container.querySelectorAll("span.h-7.w-7[aria-hidden='true']")).toHaveLength(0);
  });
});
