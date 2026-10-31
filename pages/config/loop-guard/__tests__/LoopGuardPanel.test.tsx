import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ApiError, type LoopGuardTenantView } from "@code-proxy/api-client";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { LoopGuardPanel } from "@pages/config/loop-guard/LoopGuardPanel";
import { useLoopGuardTenant } from "@pages/config/loop-guard/useLoopGuardTenant";

const mocks = vi.hoisted(() => ({
  getTenant: vi.fn(),
  putTenant: vi.fn(),
  can: vi.fn<(permission: string) => boolean>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    loopGuardApi: {
      ...actual.loopGuardApi,
      getTenant: mocks.getTenant,
      putTenant: mocks.putTenant,
    },
  };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({ can: mocks.can }),
}));

const view = (overrides: Partial<LoopGuardTenantView> = {}): LoopGuardTenantView => ({
  reply: { enabled: false, window: 0, max_distinct: 0 },
  tool: { enabled: false, repeats: 0 },
  key_overrides: 0,
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

function renderPanel(initial: LoopGuardTenantView) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <LoopGuardPanel initial={initial} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const replySwitch = () => screen.getByRole("switch", { name: "Stop repeating replies" });
const toolSwitch = () => screen.getByRole("switch", { name: "Stop tool-call loops" });
const saveButton = () => screen.getByRole("button", { name: "Save" });
const revertButton = () => screen.getByRole("button", { name: "Revert" });

describe("LoopGuardPanel (the tenant's loop protection)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.can.mockReset().mockImplementation(() => true);
    mocks.getTenant.mockReset();
    mocks.putTenant.mockReset().mockImplementation(async () => view());
  });

  test("both checks start off, with no thresholds on screen and nothing to save", () => {
    renderPanel(view());
    expect(replySwitch()).not.toBeChecked();
    expect(toolSwitch()).not.toBeChecked();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(saveButton()).toBeDisabled();
    expect(revertButton()).toBeDisabled();
  });

  test("shows what is saved: switches on and the thresholds of a check that is on", () => {
    renderPanel(
      view({
        reply: { enabled: true, window: 128, max_distinct: 16 },
        tool: { enabled: true, repeats: 5 },
      }),
    );
    expect(replySwitch()).toBeChecked();
    expect(toolSwitch()).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Lines compared" })).toHaveValue("128");
    expect(screen.getByRole("textbox", { name: "Most different lines" })).toHaveValue("16");
    expect(screen.getByRole("textbox", { name: "Identical turns in a row" })).toHaveValue("5");
  });

  test("turning a check on shows the defaults to fall back to, and the range comes from the backend", async () => {
    renderPanel(view());
    await userEvent.click(replySwitch());

    const window = screen.getByRole("textbox", { name: "Lines compared" });
    expect(window).toHaveAttribute("placeholder", "256");
    expect(window).toHaveValue("");
    expect(
      screen.getByText(
        "How many of the latest lines or sentences are compared. Default 256, from 64 to 2048.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Most different lines" })).toHaveAttribute(
      "placeholder",
      "24",
    );
    expect(saveButton()).toBeEnabled();
  });

  test("saves what was chosen, tells the user, and the panel is clean again", async () => {
    mocks.putTenant.mockResolvedValue(
      view({ reply: { enabled: true, window: 128, max_distinct: 0 } }),
    );
    renderPanel(view());

    await userEvent.click(replySwitch());
    await userEvent.type(screen.getByRole("textbox", { name: "Lines compared" }), "128");
    await userEvent.click(saveButton());

    await waitFor(() => expect(mocks.putTenant).toHaveBeenCalledTimes(1));
    // Both sections go, the empty boxes are left out: empty means "the default".
    expect(mocks.putTenant).toHaveBeenCalledWith({
      reply: { enabled: true, window: 128 },
      tool: { enabled: false },
    });
    expect(await screen.findByText("Loop protection saved")).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(replySwitch()).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Lines compared" })).toHaveValue("128");
  });

  test("after a save the panel shows what the server stored, not what was typed", async () => {
    // Another administrator turned the tool check on while this one saved the reply check.
    mocks.putTenant.mockResolvedValue(
      view({
        reply: { enabled: true, window: 128, max_distinct: 0 },
        tool: { enabled: true, repeats: 5 },
      }),
    );
    renderPanel(view());
    await userEvent.click(replySwitch());
    await userEvent.click(saveButton());

    await waitFor(() => expect(toolSwitch()).toBeChecked());
    expect(screen.getByRole("textbox", { name: "Identical turns in a row" })).toHaveValue("5");
    expect(saveButton()).toBeDisabled();
  });

  test("the tool check is saved on its own terms", async () => {
    renderPanel(view());
    await userEvent.click(toolSwitch());
    await userEvent.type(screen.getByRole("textbox", { name: "Identical turns in a row" }), "6");
    await userEvent.click(saveButton());
    await waitFor(() => expect(mocks.putTenant).toHaveBeenCalledTimes(1));
    expect(mocks.putTenant).toHaveBeenCalledWith({
      reply: { enabled: false },
      tool: { enabled: true, repeats: 6 },
    });
  });

  test("a value outside the range is explained and nothing is sent", async () => {
    renderPanel(view());
    await userEvent.click(toolSwitch());
    await userEvent.type(screen.getByRole("textbox", { name: "Identical turns in a row" }), "2");
    await userEvent.click(saveButton());

    expect(await screen.findByText("Enter a whole number from 3 to 32.")).toBeInTheDocument();
    expect(mocks.putTenant).not.toHaveBeenCalled();
  });

  test("revert puts back what is saved", async () => {
    renderPanel(view());
    await userEvent.click(replySwitch());
    expect(replySwitch()).toBeChecked();

    await userEvent.click(revertButton());
    expect(replySwitch()).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  test("somebody else saved first: the edits stay, the saved side is refreshed, and the user is told", async () => {
    mocks.putTenant.mockRejectedValue(
      new ApiError({
        message: "changed",
        status: 409,
        payload: { error: { code: "loop_guard_conflict" } },
      }),
    );
    mocks.getTenant.mockResolvedValue(view({ key_overrides: 2 }));
    renderPanel(view());

    await userEvent.click(replySwitch());
    await userEvent.click(saveButton());

    expect(
      await screen.findByText(/These settings were changed by someone else in the meantime/),
    ).toBeInTheDocument();
    expect(mocks.getTenant).toHaveBeenCalledTimes(1);
    // What the user typed is still there, and can be saved again over the newer values.
    expect(replySwitch()).toBeChecked();
    expect(saveButton()).toBeEnabled();
    expect(await screen.findByText(/API keys with settings of their own: 2/)).toBeInTheDocument();
  });

  test("a failed save says what the backend said and keeps the edits", async () => {
    mocks.putTenant.mockRejectedValue(new Error("upstream storage unavailable"));
    renderPanel(view());
    await userEvent.click(toolSwitch());
    await userEvent.click(saveButton());

    expect(await screen.findByText("upstream storage unavailable")).toBeInTheDocument();
    expect(toolSwitch()).toBeChecked();
    expect(saveButton()).toBeEnabled();
  });

  test("a failure without a message falls back to a general one", async () => {
    mocks.putTenant.mockRejectedValue(new Error(""));
    renderPanel(view());
    await userEvent.click(toolSwitch());
    await userEvent.click(saveButton());
    expect(await screen.findByText("Could not save loop protection")).toBeInTheDocument();
  });

  test("a gateway without a database can show the settings but not take a change", () => {
    renderPanel(view({ persistent: false, reply: { enabled: true, window: 0, max_distinct: 0 } }));
    expect(
      screen.getByText(
        "This gateway runs without a database, so these settings can be read but not saved.",
      ),
    ).toBeInTheDocument();
    expect(replySwitch()).toBeChecked();
    expect(replySwitch()).toBeDisabled();
    expect(toolSwitch()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  test("an account that may only read sees the settings and no way to change them", () => {
    mocks.can.mockImplementation((permission) => permission !== "tenant_settings.write");
    renderPanel(view({ tool: { enabled: true, repeats: 0 } }));
    expect(
      screen.getByText("Your account can view these settings but not change them."),
    ).toBeInTheDocument();
    expect(toolSwitch()).toBeChecked();
    expect(toolSwitch()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  test("says how many API keys carry settings of their own, and nothing when none do", () => {
    const { unmount } = renderPanel(view({ key_overrides: 3 }));
    expect(screen.getByText(/API keys with settings of their own: 3/)).toBeInTheDocument();
    unmount();
    renderPanel(view({ key_overrides: 0 }));
    expect(screen.queryByText(/API keys with settings of their own/)).toBeNull();
  });
});

describe("useLoopGuardTenant (whether the config page offers the section at all)", () => {
  beforeEach(() => {
    mocks.can.mockReset().mockImplementation(() => true);
    mocks.getTenant.mockReset();
  });

  test("hands back the settings the backend gave", async () => {
    mocks.getTenant.mockResolvedValue(view({ key_overrides: 1 }));
    const { result } = renderHook(() => useLoopGuardTenant());
    await waitFor(() => expect(result.current?.key_overrides).toBe(1));
  });

  test.each([
    [
      "an older backend without the route",
      () => Promise.reject(new ApiError({ message: "nf", status: 404 })),
    ],
    ["a response that is not a loop protection setting", () => Promise.resolve(null)],
    ["a transient failure", () => Promise.reject(new Error("offline"))],
  ])("offers nothing for %s", async (_name, answer) => {
    mocks.getTenant.mockImplementation(answer);
    const { result } = renderHook(() => useLoopGuardTenant());
    await waitFor(() => expect(mocks.getTenant).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  test("does not even ask when the account cannot read tenant settings", () => {
    mocks.can.mockImplementation((permission) => permission !== "tenant_settings.read");
    const { result } = renderHook(() => useLoopGuardTenant());
    expect(mocks.getTenant).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});
