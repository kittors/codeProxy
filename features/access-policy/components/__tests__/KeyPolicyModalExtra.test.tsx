import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { emptyQuotaMatrix } from "@code-proxy/api-client";
import { KeyPolicyModal } from "../KeyPolicyModal";
import type { PolicyEditorSection } from "../PolicyEditorLayout";

// A page can add one section of another feature to the key editor and have it saved
// before the key. The editor knows nothing about what is in it: it places it in the
// navigation, waits for the page's save, and goes to the section when that save stops it.

type Extra = Omit<PolicyEditorSection, "group">;

const extra = (overrides: Partial<Extra> = {}): Extra => ({
  id: "guard",
  label: "Guard",
  icon: <span aria-hidden="true" />,
  title: "Guard settings",
  description: "Only for this key.",
  content: <p>guard content</p>,
  ...overrides,
});

function renderModal(
  props: {
    extraSection?: Extra | null;
    beforeSubmit?: () => Promise<boolean>;
    onSubmit?: (value: unknown) => void;
    mode?: "create" | "edit";
    name?: string;
  } = {},
) {
  const onSubmit = props.onSubmit ?? vi.fn();
  render(
    <KeyPolicyModal
      open
      mode={props.mode ?? "edit"}
      initial={{ name: props.name ?? "worker", limits: emptyQuotaMatrix(), rules: [] }}
      ceiling={emptyQuotaMatrix()}
      capabilities={{ accessPolicy: true, modelFallback: true }}
      catalog={[]}
      saving={false}
      extraSection={props.extraSection}
      beforeSubmit={props.beforeSubmit}
      onSubmit={onSubmit}
      onClose={vi.fn()}
    />,
  );
  return { dialog: screen.getByRole("dialog", { name: "Edit Key quota" }), onSubmit };
}

const tabNames = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("tab")
    .map((tab) => tab.textContent?.trim());

/** A save that the test settles by hand. */
function pending() {
  let settle: (value: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("the key editor with a section added by the page", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("without one the editor is what it always was, and saving needs no other save", async () => {
    const { dialog, onSubmit } = renderModal();
    expect(tabNames(dialog)).toEqual(["Basics", "Quota", "Model rules"]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("null is the same as none", () => {
    const { dialog } = renderModal({ extraSection: null });
    expect(tabNames(dialog)).toEqual(["Basics", "Quota", "Model rules"]);
  });

  test("it is listed last, among quota and rules, and shows the page's own content", async () => {
    const { dialog } = renderModal({ extraSection: extra() });
    expect(tabNames(dialog)).toEqual(["Basics", "Quota", "Model rules", "Guard"]);

    await userEvent.click(within(dialog).getByRole("tab", { name: "Guard" }));
    expect(within(dialog).getByRole("heading", { name: "Guard settings" })).toBeInTheDocument();
    expect(within(dialog).getByText("Only for this key.")).toBeInTheDocument();
    expect(within(dialog).getByText("guard content")).toBeInTheDocument();
  });

  test("it can mark itself as needing changes in the navigation", () => {
    const { dialog } = renderModal({ extraSection: extra({ invalid: true }) });
    expect(within(dialog).getByRole("tab", { name: /Guard/ })).toHaveAccessibleName(
      /This section needs changes/,
    );
  });

  test("the page's save runs after the editor's own checks and before the key is submitted", async () => {
    const calls: string[] = [];
    const onSubmit = vi.fn(() => void calls.push("submit"));
    const beforeSubmit = vi.fn(async () => {
      calls.push("before");
      return true;
    });
    const { dialog } = renderModal({ extraSection: extra(), beforeSubmit, onSubmit });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["before", "submit"]);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "worker" }));
  });

  test("the page's save is not run for a key the editor itself would refuse", async () => {
    const beforeSubmit = vi.fn(async () => true);
    const { dialog, onSubmit } = renderModal({ extraSection: extra(), beforeSubmit, name: "" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Required")).toBeInTheDocument();
  });

  test("when the page's save says stop, the key is not submitted and the section is shown", async () => {
    const beforeSubmit = vi.fn(async () => false);
    const { dialog, onSubmit } = renderModal({ extraSection: extra(), beforeSubmit });
    // Wherever the person was, the reason is in the section.
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("guard content")).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Guard" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("a save that throws is a stop, not a pass", async () => {
    const beforeSubmit = vi.fn(async () => {
      throw new Error("boom");
    });
    const { dialog, onSubmit } = renderModal({ extraSection: extra(), beforeSubmit });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("guard content")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("a second submit while the page's save is still running is ignored", async () => {
    const save = pending();
    const beforeSubmit = vi.fn(() => save.promise);
    const { dialog, onSubmit } = renderModal({ extraSection: extra(), beforeSubmit });
    const button = within(dialog).getByRole("button", { name: "Save" });

    await userEvent.click(button);
    await userEvent.click(button);
    // The keyboard shortcut does not look at the button either.
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(beforeSubmit).toHaveBeenCalledTimes(1);

    save.settle(true);
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // Once it has finished, the next submit is a new one.
    await userEvent.click(button);
    await vi.waitFor(() => expect(beforeSubmit).toHaveBeenCalledTimes(2));
  });

  test("a stop leaves the editor ready to submit again", async () => {
    const answers = [false, true];
    const beforeSubmit = vi.fn(async () => answers.shift() ?? true);
    const { dialog, onSubmit } = renderModal({ extraSection: extra(), beforeSubmit });
    const button = within(dialog).getByRole("button", { name: "Save" });

    await userEvent.click(button);
    await within(dialog).findByText("guard content");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.click(button);
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  test("with a page save but no section the save still runs and a stop only keeps the editor open", async () => {
    const beforeSubmit = vi.fn(async () => false);
    const { dialog, onSubmit } = renderModal({ beforeSubmit });

    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(beforeSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(tabNames(dialog)).toEqual(["Basics", "Quota", "Model rules"]);
  });
});
