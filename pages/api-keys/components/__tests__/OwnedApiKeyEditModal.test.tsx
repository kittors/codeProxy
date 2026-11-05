import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiError, type LoopGuardKeyView } from "@code-proxy/api-client";
import { emptyPeriodSpendingDraft, type OwnedApiKeyQuotaForm } from "@features/period-spending";
import { OwnedApiKeyEditModal } from "../OwnedApiKeyEditModal";

// Editing a key of a portal account: name and sub-quota, plus the key's loop protection
// override when the backend has it. Saving writes the override first and the key only if
// that worked; on a backend without loop protection the dialog is what it always was.

const mocks = vi.hoisted(() => ({
  getKey: vi.fn(),
  putKey: vi.fn(),
  can: vi.fn<(permission: string) => boolean>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    loopGuardApi: { ...actual.loopGuardApi, getKey: mocks.getKey, putKey: mocks.putKey },
  };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({ can: mocks.can }),
}));

const keyView = (overrides: Partial<LoopGuardKeyView> = {}): LoopGuardKeyView => ({
  key_id: "key-1",
  reply: { enabled: null, window: 0, max_distinct: 0 },
  tool: { enabled: null, repeats: 0 },
  tenant: {
    reply: { enabled: false, window: 0, max_distinct: 0 },
    tool: { enabled: false, repeats: 0 },
  },
  effective: {
    reply: { enabled: false, source: "", window: 0, max_distinct: 0 },
    tool: { enabled: false, source: "", repeats: 0 },
  },
  persistent: true,
  updated_at: "",
  defaults: { reply_window: 256, reply_max_distinct: 24, tool_repeats: 8 },
  bounds: {
    min_reply_window: 64,
    max_reply_window: 2048,
    min_reply_distinct: 2,
    reply_distinct_window_share: 4,
    min_tool_repeats: 3,
    max_tool_repeats: 32,
  },
  ...overrides,
});

function Harness({
  keyId = "key-1",
  name = "Laptop",
  open = true,
  onSubmit,
}: {
  keyId?: string;
  name?: string;
  open?: boolean;
  onSubmit: () => void;
}) {
  const [value, setValue] = useState<OwnedApiKeyQuotaForm>({
    name,
    periods: emptyPeriodSpendingDraft(),
  });
  return (
    <OwnedApiKeyEditModal
      t={i18n.t.bind(i18n)}
      open={open}
      keyId={keyId || undefined}
      value={value}
      accountLimits={{ "5h": 0, day: 0, week: 0, month: 0 }}
      saving={false}
      onChange={setValue}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Edit Key quota" });
const save = () => within(dialog()).getByRole("button", { name: "Save" });
const section = () => within(dialog()).findByRole("heading", { name: "Loop protection" });
const replyMode = () => within(dialog()).getByRole("combobox", { name: "Stop repeating replies" });

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("editing an account's key, and its loop protection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.can.mockReset().mockImplementation(() => true);
    mocks.getKey.mockReset().mockResolvedValue(keyView());
    mocks.putKey.mockReset().mockImplementation(async () => keyView());
  });

  test("adds the section for that key", async () => {
    render(<Harness onSubmit={vi.fn()} />);
    expect(await section()).toBeInTheDocument();
    expect(mocks.getKey).toHaveBeenCalledWith("key-1");
    expect(replyMode()).toBeEnabled();
  });

  test("an entry that has no id yet is not looked up", async () => {
    render(<Harness keyId="" onSubmit={vi.fn()} />);
    expect(within(dialog()).getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(within(dialog()).queryByRole("heading", { name: "Loop protection" })).toBeNull();
  });

  test("asks nothing while the dialog is closed", () => {
    render(<Harness open={false} onSubmit={vi.fn()} />);
    expect(mocks.getKey).not.toHaveBeenCalled();
  });

  test("on a backend without loop protection the dialog is what it was, and saving is unchanged", async () => {
    mocks.getKey.mockRejectedValue(new ApiError({ message: "not found", status: 404 }));
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenCalled());
    expect(within(dialog()).queryByRole("heading", { name: "Loop protection" })).toBeNull();

    await userEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("saving without touching the section saves the key alone", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await section();

    await userEvent.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("an edit in the section is written first, and the key is saved after it", async () => {
    const order: string[] = [];
    mocks.putKey.mockImplementation(async () => {
      order.push("override");
      return keyView({ reply: { enabled: false, window: 0, max_distinct: 0 } });
    });
    const onSubmit = vi.fn(() => {
      order.push("key");
    });
    render(<Harness onSubmit={onSubmit} />);
    await section();

    await choose(replyMode(), "Off for this key");
    await userEvent.click(save());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["override", "key"]);
    expect(mocks.putKey).toHaveBeenCalledWith("key-1", {
      reply: { enabled: false },
      tool: { enabled: null },
    });
  });

  test("when the override cannot be written the key is not saved, and the user stays to fix it", async () => {
    mocks.putKey.mockRejectedValue(
      new ApiError({ message: "settings are read-only", status: 503 }),
    );
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await section();

    await choose(replyMode(), "On for this key");
    await userEvent.click(save());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("settings are read-only");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(replyMode()).toHaveTextContent("On for this key");
  });

  test("a value outside the range keeps the key from being saved and says the range", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await section();

    await choose(replyMode(), "On for this key");
    await userEvent.type(within(dialog()).getByRole("textbox", { name: "Lines compared" }), "5");
    await userEvent.click(save());

    expect(
      await within(dialog()).findByText("Enter a whole number from 64 to 2048."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("an empty name is caught by the key's own validation before anything is written", async () => {
    const onSubmit = vi.fn();
    render(<Harness name="" onSubmit={onSubmit} />);
    await section();
    await choose(replyMode(), "Off for this key");

    await userEvent.click(save());
    expect(await within(dialog()).findByText("Required")).toBeInTheDocument();
    expect(mocks.putKey).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("an account that may not write keys sees the section but cannot change it", async () => {
    mocks.can.mockImplementation((permission) => permission !== "api_keys.write");
    render(<Harness onSubmit={vi.fn()} />);
    await section();
    expect(replyMode()).toBeDisabled();
    expect(within(dialog()).getByRole("combobox", { name: "Stop tool-call loops" })).toBeDisabled();
  });

  test("while the override is being written the dialog cannot be cancelled and the key waits", async () => {
    let finish!: (view: LoopGuardKeyView) => void;
    mocks.putKey.mockImplementation(
      () => new Promise<LoopGuardKeyView>((resolve) => void (finish = resolve)),
    );
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await section();

    await choose(replyMode(), "Off for this key");
    await userEvent.click(save());

    await waitFor(() =>
      expect(within(dialog()).getByRole("button", { name: "Cancel" })).toBeDisabled(),
    );
    expect(replyMode()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();

    finish(keyView({ reply: { enabled: false, window: 0, max_distinct: 0 } }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
