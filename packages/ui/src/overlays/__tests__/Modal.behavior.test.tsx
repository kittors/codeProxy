import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { Select } from "../../primitives/Select";
import { TextInput } from "../../primitives/Input";
import { ConfirmModal } from "../ConfirmModal";
import { Drawer } from "../Drawer";
import { ImagePreviewOverlay } from "../ImagePreviewOverlay";
import { Modal } from "../Modal";

const backdrop = () => document.querySelector<HTMLButtonElement>("[data-overlay-backdrop]")!;

describe("Modal keyboard and dismissal", () => {
  test("Escape closes only the topmost of two nested dialogs", async () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      <>
        <Modal open title="Outer" onClose={outerClose}>
          outer body
        </Modal>
        <Modal open title="Inner" onClose={innerClose}>
          inner body
        </Modal>
      </>,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  test("Escape with a dropdown open only closes the dropdown", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function Harness() {
      const [value, setValue] = useState("a");
      return (
        <Modal open title="With select" onClose={onClose}>
          <Select
            aria-label="Fruit"
            value={value}
            onChange={setValue}
            options={[
              { value: "a", label: "Apple" },
              { value: "b", label: "Banana" },
            ]}
          />
        </Modal>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("combobox", { name: "Fruit" }));
    expect(await screen.findByRole("option", { name: "Banana" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("option", { name: "Banana" })).toBeNull());

    // 下拉已经收起，再按一次 Esc 才关闭弹窗。
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("clicking the backdrop closes an untouched dialog", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Plain" onClose={onClose}>
        <TextInput aria-label="Name" />
      </Modal>,
    );
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("after typing, the backdrop nudges instead of closing; the close button still works", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Form" onClose={onClose}>
        <TextInput aria-label="Name" />
      </Modal>,
    );
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Ada");
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveClass("overlay-nudge"));

    // Esc 是明确的关闭意图：没有显式 dirty 时照常关闭。
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /close|关闭/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("an explicitly dirty dialog also ignores Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Dirty" dirty onClose={onClose}>
        body
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
  });

  test("a non-closable dialog hides the close button and reports blocked dismissals", () => {
    const onClose = vi.fn();
    const onBlockedClose = vi.fn();
    render(
      <Modal open title="Forced" closable={false} onBlockedClose={onBlockedClose} onClose={onClose}>
        body
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: /close|关闭/i })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(onBlockedClose).toHaveBeenCalledTimes(2);
  });

  test("focuses the first field on open and returns focus to the trigger on close", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal open={open} title="Create" onClose={() => setOpen(false)}>
            <TextInput aria-label="Display name" />
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Display name" })).toHaveFocus(),
    );

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("Tab wraps inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <Modal open title="Wrap" onClose={() => undefined} footer={<button type="button">Save</button>}>
        <TextInput aria-label="First" />
      </Modal>,
    );
    const first = screen.getByRole("textbox", { name: "First" });
    await waitFor(() => expect(first).toHaveFocus());
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab();
    // 关闭按钮在头部、是面板里第一个可聚焦元素：从最后一个 Tab 出去回到它。
    expect(screen.getByRole("button", { name: /close|关闭/i })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  test("Cmd/Ctrl + Enter runs the submit shortcut", () => {
    const onSubmit = vi.fn();
    render(
      <Modal open title="Shortcut" onSubmitShortcut={onSubmit} onClose={() => undefined}>
        body
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  test("renders the icon tile and links the description", () => {
    render(
      <Modal
        open
        title="Create user"
        description="They can sign in right away."
        icon={<svg data-testid="icon" />}
        onClose={() => undefined}
      >
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Create user" });
    expect(dialog).toHaveAccessibleDescription("They can sign in right away.");
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

describe("ConfirmModal", () => {
  test("shows the subject and consequences and gates on the typed phrase", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        title="Delete tenant"
        description="This cannot be undone."
        subject={<strong>acme-prod</strong>}
        consequences={["All keys stop working", "Usage history is removed"]}
        confirmPhrase="acme-prod"
        confirmText="Delete"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    expect(screen.getByText("acme-prod", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("All keys stop working")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).toBeDisabled();
    const input = screen.getByRole("textbox");
    await user.type(input, "acme-pro");
    expect(confirm).toBeDisabled();
    await user.type(input, "d{Enter}");
    expect(confirm).toBeEnabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("a plain confirm does not auto-focus the destructive button", async () => {
    render(
      <ConfirmModal
        open
        title="Remove"
        description="Remove it?"
        confirmText="Remove"
        onConfirm={() => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByRole("button", { name: "Remove" })).not.toHaveFocus();
  });
});

describe("Drawer dismissal", () => {
  test("after typing, the backdrop nudges instead of closing; Escape and the close button still work", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open title="Menu" onClose={onClose}>
        <TextInput aria-label="Code" />
      </Drawer>,
    );
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole("textbox", { name: "Code" }), "system.config");
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveClass("overlay-nudge"));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: /close|关闭/i }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("an explicitly dirty drawer also ignores Escape", () => {
    const onClose = vi.fn();
    const onBlockedClose = vi.fn();
    render(
      <Drawer open title="Menu" dirty onBlockedClose={onBlockedClose} onClose={onClose}>
        body
      </Drawer>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(onBlockedClose).toHaveBeenCalledTimes(2);
  });
});

describe("ImagePreviewOverlay inside a dialog", () => {
  test("Escape closes only the preview, and focus returns to the image that opened it", async () => {
    const user = userEvent.setup();
    const onDialogClose = vi.fn();
    function Harness() {
      const [preview, setPreview] = useState(false);
      return (
        <Modal open title="Log content" onClose={onDialogClose}>
          <button type="button" onClick={() => setPreview(true)}>
            Open image
          </button>
          <ImagePreviewOverlay
            open={preview}
            imageSrc="data:image/png;base64,iVBORw0KGgo="
            imageAlt="Generated"
            title="Preview"
            onClose={() => setPreview(false)}
          />
        </Modal>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open image" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Preview" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Preview" })).toBeNull());
    expect(onDialogClose).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    // 预览关了之后，Esc 又归弹窗管。
    await user.keyboard("{Escape}");
    expect(onDialogClose).toHaveBeenCalledTimes(1);
  });
});
