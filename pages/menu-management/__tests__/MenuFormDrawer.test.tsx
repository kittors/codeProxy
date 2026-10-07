import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MenuIdentity, MenuWriteBody } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { MenuDeleteConfirm } from "../MenuDeleteConfirm";
import { MenuFormDrawer } from "../MenuFormDrawer";
import { emptyMenuForm } from "../menuForm";

const runtimeDirectory: MenuIdentity = {
  code: "group.runtime",
  parent_code: "",
  type: "directory",
  path: "/runtime",
  component: "Layout",
  link_url: "",
  label_key: "shell.nav_group_runtime",
  title: "",
  icon: "activity",
  permission_code: "",
  sort_order: 20,
  visible: true,
  enabled: true,
  badge_type: "",
  badge_content: "",
  hide_menu: false,
  system_protected: true,
  version: 1,
};

function Harness({
  initial,
  onSubmit,
}: {
  initial?: Partial<MenuWriteBody>;
  onSubmit: (form: MenuWriteBody) => void;
}) {
  const [form, setForm] = useState<MenuWriteBody>({ ...emptyMenuForm(), ...initial });
  return (
    <MenuFormDrawer
      open
      mode="create"
      editing={null}
      form={form}
      setForm={setForm}
      menus={[runtimeDirectory]}
      parentOptions={[{ value: "", label: "None (root)" }]}
      busy={false}
      onSubmit={() => onSubmit(form)}
      onClose={() => undefined}
    />
  );
}

describe("MenuFormDrawer", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("groups fields, explains the two hide options and validates like the server", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness initial={{ parent_code: "group.runtime" }} onSubmit={onSubmit} />);

    const drawer = screen.getByRole("dialog", { name: "New menu" });
    for (const heading of ["Basics", "Route and component", "Access and display"]) {
      expect(within(drawer).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    // 两个「隐藏」选项各自写清了区别。
    expect(
      within(drawer).getByRole("checkbox", { name: "Hide in menu" }),
    ).toHaveAccessibleDescription(/opens from its address/);
    expect(within(drawer).getByRole("checkbox", { name: "Hidden" })).toHaveAccessibleDescription(
      /embedded page's address stops working/,
    );

    await user.click(within(drawer).getByRole("button", { name: "Create menu" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const code = within(drawer).getByLabelText(/^Menu code/);
    await waitFor(() => expect(code).toHaveAttribute("aria-invalid", "true"));

    // 挂在 /runtime 目录下的页面，地址必须落在 /runtime 之下。
    const path = within(drawer).getByRole("textbox", { name: "Route path" });
    await user.type(path, "/other/page");
    expect(path).toHaveAccessibleDescription(/under the parent directory's path \/runtime/);
    await user.clear(path);
    await user.type(path, "runtime/page");
    expect(path).toHaveAccessibleDescription(/Must start with \//);

    await user.clear(path);
    await user.type(path, "/runtime/page");
    await user.type(code, "custom.page");
    await user.type(within(drawer).getByRole("textbox", { name: "Label key" }), "custom.page");
    await user.click(within(drawer).getByRole("button", { name: "Create menu" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ code: "custom.page", path: "/runtime/page", type: "menu" }),
    );
  });

  test("a button has no route, and switching type drops the route fields", async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => undefined} />);

    const drawer = screen.getByRole("dialog", { name: "New menu" });
    await user.click(within(drawer).getByRole("radio", { name: /^Button/ }));
    expect(within(drawer).queryByRole("textbox", { name: "Route path" })).toBeNull();
    expect(within(drawer).getByText(/has no route or component/)).toBeInTheDocument();
  });
});

describe("MenuDeleteConfirm", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("warns when the menu still has children the server will refuse to orphan", () => {
    render(
      <MenuDeleteConfirm
        menu={runtimeDirectory}
        name="Runtime"
        typeLabel="Directory"
        childCount={3}
        busy={false}
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Delete menu “Runtime”?" });
    expect(within(dialog).getByText("group.runtime")).toBeInTheDocument();
    expect(within(dialog).getByText(/still has 3 child menus or buttons/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Permissions roles already have are unaffected/),
    ).toBeInTheDocument();
  });
});
