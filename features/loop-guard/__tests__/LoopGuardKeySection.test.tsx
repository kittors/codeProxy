import { useState } from "react";
import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiError, type LoopGuardKeyView } from "@code-proxy/api-client";
import { LoopGuardKeySection } from "../LoopGuardKeySection";
import { useLoopGuardKey } from "../useLoopGuardKey";

const mocks = vi.hoisted(() => ({ getKey: vi.fn(), putKey: vi.fn() }));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    loopGuardApi: { ...actual.loopGuardApi, getKey: mocks.getKey, putKey: mocks.putKey },
  };
});

const INFO = {
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
};

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
  ...INFO,
  ...overrides,
});

/** The dialog's role: read the override when open, save it on a button, show what save answered. */
function Harness({ keyId = "key-1", active = true }: { keyId?: string; active?: boolean }) {
  const override = useLoopGuardKey(keyId, active);
  const [answer, setAnswer] = useState("");
  return (
    <>
      <LoopGuardKeySection override={override} disabled={false} />
      <button
        type="button"
        onClick={() => void override.save().then((ok) => setAnswer(String(ok)))}
      >
        save override
      </button>
      <output data-testid="answer">{answer}</output>
    </>
  );
}

const replyMode = () => screen.getByRole("combobox", { name: "Stop repeating replies" });
const toolMode = () => screen.getByRole("combobox", { name: "Stop tool-call loops" });

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("the loop protection section of the API key dialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getKey.mockReset().mockResolvedValue(keyView());
    mocks.putKey.mockReset().mockImplementation(async (_id: string, _body: unknown) => keyView());
  });

  test("shows both checks following the tenant, with what is in force for this key", async () => {
    mocks.getKey.mockResolvedValue(
      keyView({
        tenant: {
          reply: { enabled: true, window: 0, max_distinct: 0 },
          tool: { enabled: false, repeats: 0 },
        },
        effective: {
          reply: { enabled: true, source: "tenant", window: 256, max_distinct: 24 },
          tool: { enabled: false, source: "", repeats: 0 },
        },
      }),
    );
    render(<Harness />);

    expect(await screen.findByRole("heading", { name: "Loop protection" })).toBeInTheDocument();
    expect(mocks.getKey).toHaveBeenCalledWith("key-1");
    expect(replyMode()).toHaveTextContent("Follow the tenant (on)");
    expect(toolMode()).toHaveTextContent("Follow the tenant (off)");
    expect(
      screen.getByText("Applied to requests with this key right now, switched on by the tenant."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Not applied to requests with this key right now."),
    ).toBeInTheDocument();
  });

  test("says when the key itself switched a check on", async () => {
    mocks.getKey.mockResolvedValue(
      keyView({
        reply: { enabled: true, window: 0, max_distinct: 0 },
        effective: {
          reply: { enabled: true, source: "api_key", window: 256, max_distinct: 24 },
          tool: { enabled: false, source: "", repeats: 0 },
        },
      }),
    );
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });
    expect(replyMode()).toHaveTextContent("On for this key");
    expect(
      screen.getByText("Applied to requests with this key right now, switched on for this key."),
    ).toBeInTheDocument();
  });

  test.each([
    [
      "an older backend that has no such route",
      new ApiError({ message: "not found", status: 404 }),
    ],
    ["an account that may not read it", new ApiError({ message: "forbidden", status: 403 })],
  ])("is not there at all for %s, and the dialog stays as it was", async (_name, error) => {
    mocks.getKey.mockRejectedValue(error);
    render(<Harness />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenCalled());
    // Not even a skeleton, which would flash on a backend that never had the section.
    expect(screen.queryByRole("heading", { name: "Loop protection" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "save override" }));
    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("true"));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("is not there when the answer is not a loop protection setting", async () => {
    mocks.getKey.mockResolvedValue(null);
    render(<Harness />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Loop protection" })).toBeNull();
  });

  test("asks nothing while the dialog is closed", () => {
    render(<Harness active={false} />);
    expect(mocks.getKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Loop protection" })).toBeNull();
  });

  test("a failed read is said in the section, can be retried, and does not stop the key from saving", async () => {
    mocks.getKey.mockRejectedValueOnce(new Error("network down"));
    render(<Harness />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load this key's loop protection settings.");

    // Saving the key with the section unread must not wait for it or fail on it.
    await userEvent.click(screen.getByRole("button", { name: "save override" }));
    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("true"));
    expect(mocks.putKey).not.toHaveBeenCalled();

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("combobox", { name: "Stop repeating replies" }),
    ).toBeInTheDocument();
    expect(mocks.getKey).toHaveBeenCalledTimes(2);
  });

  test("saving without an edit sends nothing", async () => {
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });
    await userEvent.click(screen.getByRole("button", { name: "save override" }));
    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("true"));
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("an edit is written for this key, following the tenant where nothing was chosen", async () => {
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });

    await choose(replyMode(), "Off for this key");
    await userEvent.click(screen.getByRole("button", { name: "save override" }));

    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("true"));
    expect(mocks.putKey).toHaveBeenCalledTimes(1);
    expect(mocks.putKey).toHaveBeenCalledWith("key-1", {
      reply: { enabled: false },
      tool: { enabled: null },
    });
  });

  test("a threshold typed for a check switched on is written with it", async () => {
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });

    await choose(toolMode(), "On for this key");
    await userEvent.type(screen.getByRole("textbox", { name: "Identical turns in a row" }), "5");
    await userEvent.click(screen.getByRole("button", { name: "save override" }));

    await waitFor(() => expect(mocks.putKey).toHaveBeenCalledTimes(1));
    expect(mocks.putKey).toHaveBeenCalledWith("key-1", {
      reply: { enabled: null },
      tool: { enabled: true, repeats: 5 },
    });
  });

  test("a value outside the backend's range stops the save and says the range", async () => {
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });

    await choose(replyMode(), "On for this key");
    await userEvent.type(screen.getByRole("textbox", { name: "Lines compared" }), "10");
    await userEvent.click(screen.getByRole("button", { name: "save override" }));

    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("false"));
    expect(screen.getByText("Enter a whole number from 64 to 2048.")).toBeInTheDocument();
    expect(mocks.putKey).not.toHaveBeenCalled();
  });

  test("the range is not scolded about while the number is still being typed", async () => {
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });

    await choose(replyMode(), "On for this key");
    const window = screen.getByRole("textbox", { name: "Lines compared" });
    await userEvent.type(window, "12");
    expect(screen.queryByText(/Enter a whole number/)).toBeNull();

    await userEvent.tab();
    expect(await screen.findByText("Enter a whole number from 64 to 2048.")).toBeInTheDocument();
  });

  test("a refused write is shown in the section, stops the dialog, and keeps the edit", async () => {
    mocks.putKey.mockRejectedValue(new ApiError({ message: "database is read-only", status: 503 }));
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });

    await choose(replyMode(), "Off for this key");
    await userEvent.click(screen.getByRole("button", { name: "save override" }));

    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("false"));
    expect(screen.getByRole("alert")).toHaveTextContent("database is read-only");
    expect(replyMode()).toHaveTextContent("Off for this key");
  });

  test("the saved answer becomes the new baseline: saving again without an edit sends nothing", async () => {
    mocks.putKey.mockResolvedValue(
      keyView({ reply: { enabled: false, window: 0, max_distinct: 0 } }),
    );
    render(<Harness />);
    await screen.findByRole("heading", { name: "Loop protection" });
    await choose(replyMode(), "Off for this key");

    await userEvent.click(screen.getByRole("button", { name: "save override" }));
    await waitFor(() => expect(mocks.putKey).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "save override" }));
    await waitFor(() => expect(screen.getByTestId("answer")).toHaveTextContent("true"));
    expect(mocks.putKey).toHaveBeenCalledTimes(1);
  });

  test("a second save while the first is still writing writes nothing and says not to go on", async () => {
    let finish!: (view: LoopGuardKeyView) => void;
    mocks.putKey.mockImplementation(
      () => new Promise<LoopGuardKeyView>((resolve) => void (finish = resolve)),
    );
    const { result } = renderHook(() => useLoopGuardKey("key-1", true));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    act(() => result.current.form.patch({ replyMode: "off" }));

    let first!: Promise<boolean>;
    act(() => {
      first = result.current.save();
    });
    // The submit shortcut does not wait for the button: this is the second one.
    let second = true;
    await act(async () => {
      second = await result.current.save();
    });
    expect(second).toBe(false);
    expect(mocks.putKey).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish(keyView({ reply: { enabled: false, window: 0, max_distinct: 0 } }));
      await first;
    });
    expect(await first).toBe(true);
    // Once the write is over the next save is a new one (and has nothing left to write).
    await act(async () => {
      expect(await result.current.save()).toBe(true);
    });
    expect(mocks.putKey).toHaveBeenCalledTimes(1);
  });

  test("a gateway without a database shows the reason and locks the controls", async () => {
    mocks.getKey.mockResolvedValue(keyView({ persistent: false }));
    render(<Harness />);
    expect(
      await screen.findByText(
        "This gateway runs without a database, so these settings can be read but not saved.",
      ),
    ).toBeInTheDocument();
    expect(replyMode()).toBeDisabled();
    expect(toolMode()).toBeDisabled();
  });

  test("opening the dialog on another key reads that key", async () => {
    const { rerender } = render(<Harness keyId="key-1" />);
    await screen.findByRole("heading", { name: "Loop protection" });
    mocks.getKey.mockResolvedValue(
      keyView({ key_id: "key-2", reply: { enabled: true, window: 0, max_distinct: 0 } }),
    );
    rerender(<Harness keyId="key-2" />);
    await waitFor(() => expect(mocks.getKey).toHaveBeenLastCalledWith("key-2"));
    await waitFor(() => expect(replyMode()).toHaveTextContent("On for this key"));
  });
});
