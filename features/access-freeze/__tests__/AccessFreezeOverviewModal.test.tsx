import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider, toast } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { ApiClientError, type AccessFreeze } from "@code-proxy/api-client";
import { AccessFreezeOverviewModal } from "../AccessFreezeOverviewModal";
import type { AccessFreezeOverview } from "../useAccessFreezeOverview";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  release: vi.fn(),
  keyEntries: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    accessFreezesApi: {
      getSettings: mocks.getSettings,
      putSettings: mocks.putSettings,
      release: mocks.release,
    },
    apiKeyEntriesApi: { ...actual.apiKeyEntriesApi, list: mocks.keyEntries },
  };
});

const freeze = (
  id: number,
  kind: "end_user" | "api_key",
  subjectId: string,
  extra: Partial<AccessFreeze> = {},
): AccessFreeze => ({
  id,
  subject: { tenant_id: "t1", kind, id: subjectId },
  subject_name: "",
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: "flagged",
  model: "gpt-6.1-sol",
  strike_count: 2,
  frozen_at: "2026-11-13T02:00:00Z",
  notice: "frozen",
  ...extra,
});

const overviewOf = (
  freezes: AccessFreeze[],
  patch: Partial<AccessFreezeOverview> = {},
): AccessFreezeOverview => ({
  freezes,
  loading: false,
  error: null,
  unavailable: false,
  byEndUser: new Map(),
  apiKeyFreezes: freezes.filter((item) => item.subject.kind === "api_key"),
  refresh: vi.fn(async () => undefined),
  ...patch,
});

function renderOverview(overview: AccessFreezeOverview, props: Record<string, unknown> = {}) {
  const onOpenSubject = vi.fn();
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <ToastProvider>
        <AccessFreezeOverviewModal
          open
          onClose={onClose}
          canWrite
          overview={overview}
          endUserName={(id) => (id === "user-1" ? "Alice / alice" : undefined)}
          onOpenSubject={onOpenSubject}
          {...props}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
  return { onOpenSubject, onClose };
}

const apiError = (status: number, code: string) =>
  new ApiClientError({ message: code, status, data: { error: { code, message: code } } });

describe("AccessFreezeOverviewModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getSettings.mockResolvedValue({ threshold: 1, default_threshold: 1, max_threshold: 100 });
    mocks.putSettings.mockImplementation(async (threshold: number) => ({
      threshold,
      default_threshold: 1,
      max_threshold: 100,
    }));
    mocks.release.mockResolvedValue(
      freeze(1, "end_user", "user-1", { released_at: "2026-11-13T03:00:00Z" }),
    );
  });

  afterEach(async () => {
    // The toast store outlives a test: a toast left over would turn up in the next one's screen.
    toast.dismiss();
    await i18n.changeLanguage("zh-CN");
  });

  test("lists every freeze in effect, including a key no portal account owns, by name where it can", async () => {
    const overview = overviewOf([
      freeze(1, "end_user", "user-1"),
      freeze(2, "end_user", "user-gone"),
      freeze(3, "api_key", "key-named", { subject_name: "CI bot" }),
      freeze(4, "api_key", "0123456789abcdef"),
    ]);
    renderOverview(overview);

    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    const table = within(dialog).getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveTextContent("Alice / alice");
    expect(rows[1]).toHaveTextContent("Portal account");
    expect(rows[1]).toHaveTextContent("Codex");
    expect(rows[1]).toHaveTextContent("gpt-6.1-sol");
    // An account that is no longer in the list is still told apart by its id.
    expect(rows[2]).toHaveTextContent("Account user-gon");
    // A key is named by the name the backend resolved; with none, by the front of its id.
    expect(rows[3]).toHaveTextContent("CI bot");
    expect(rows[3]).toHaveTextContent("API key");
    expect(rows[4]).toHaveTextContent("Key 01234567");
    expect(overview.refresh).toHaveBeenCalled();
  });

  test("never reads the key list, which carries every key's secret, to name a frozen key", async () => {
    renderOverview(overviewOf([freeze(3, "api_key", "key-named")]));
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    // An older backend sends no subject_name: the key is told apart by its id, not an error.
    expect(within(dialog).getByText("Key key-name")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(mocks.keyEntries).not.toHaveBeenCalled();
  });

  test("prefers the name the backend resolved over the page's own list", async () => {
    renderOverview(
      overviewOf([freeze(1, "end_user", "user-1", { subject_name: "Alice Renamed" })]),
    );
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    expect(within(dialog).getByText("Alice Renamed")).toBeInTheDocument();
  });

  test("opens the detail of whoever is frozen, resolved to what the panel calls them", async () => {
    const { onOpenSubject } = renderOverview(
      overviewOf([
        freeze(1, "end_user", "user-1"),
        freeze(3, "api_key", "key-named", { subject_name: "CI bot" }),
      ]),
    );
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    // The key's name is what the detail is titled with.
    await within(dialog).findByText("CI bot");
    const buttons = within(dialog).getAllByRole("button", { name: "View details" });
    await userEvent.click(buttons[0]);
    expect(onOpenSubject).toHaveBeenLastCalledWith({
      kind: "end_user",
      id: "user-1",
      name: "Alice / alice",
    });

    await userEvent.click(buttons[1]);
    expect(onOpenSubject).toHaveBeenLastCalledWith({
      kind: "api_key",
      id: "key-named",
      name: "CI bot",
    });
  });

  test("releases one from the list and has the list read again", async () => {
    const overview = overviewOf([freeze(1, "end_user", "user-1")]);
    renderOverview(overview);
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Release" }));

    const confirm = await screen.findByRole("dialog", { name: "Release the freeze" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Release" }));
    await waitFor(() => expect(mocks.release).toHaveBeenCalledWith(1, ""));
    // Opening the dialog read the list once; the release reads it again.
    await waitFor(() => expect(overview.refresh).toHaveBeenCalledTimes(2));
  });

  test("shows no release or threshold change without the permission to write", async () => {
    renderOverview(overviewOf([freeze(1, "end_user", "user-1")]), { canWrite: false });
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    expect(within(dialog).queryByRole("button", { name: "Release" })).toBeNull();
    expect(
      await within(dialog).findByText("You can view this setting but not change it"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Save threshold" })).toBeNull();
    expect(
      within(dialog).getByRole("textbox", { name: "Freeze after this many refusals" }),
    ).toBeDisabled();
  });

  test("says what the list is when nothing is frozen", async () => {
    renderOverview(overviewOf([]));
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    expect(within(dialog).getByText("No freezes are in effect")).toBeInTheDocument();
  });

  test("a failed read is shown with a way to retry", async () => {
    const overview = overviewOf([], { error: new Error("offline") });
    renderOverview(overview);
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes" });
    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("Could not load the upstream freezes");
    expect(alert).toHaveTextContent("offline");
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(overview.refresh).toHaveBeenCalledTimes(2);
  });
});

describe("the freeze threshold in the overview", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getSettings.mockResolvedValue({ threshold: 1, default_threshold: 1, max_threshold: 100 });
    mocks.putSettings.mockImplementation(async (threshold: number) => ({
      threshold,
      default_threshold: 1,
      max_threshold: 100,
    }));
    mocks.keyEntries.mockResolvedValue([]);
  });

  afterEach(async () => {
    toast.dismiss();
    await i18n.changeLanguage("zh-CN");
  });

  const field = async () =>
    (await screen.findByRole("textbox", {
      name: "Freeze after this many refusals",
    })) as HTMLInputElement;

  test("shows the backend's current value, default and limit", async () => {
    renderOverview(overviewOf([]));
    expect(await field()).toHaveValue("1");
    expect(
      screen.getByText(/Counted from the last release.*Default 1, at most 100\./),
    ).toBeInTheDocument();
    // Nothing to save until it changes.
    expect(screen.getByRole("button", { name: "Save threshold" })).toBeDisabled();
  });

  test("saves a new value, 0 included, and says 0 only records", async () => {
    renderOverview(overviewOf([]));
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    await userEvent.click(screen.getByRole("button", { name: "Save threshold" }));
    await waitFor(() => expect(mocks.putSettings).toHaveBeenLastCalledWith(3));
    expect(await screen.findByText("Threshold saved")).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "0");
    expect(
      screen.getByText("With 0, refusals are only recorded; nobody gets frozen."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save threshold" }));
    // 0 is a choice, not "unset": it is sent as 0.
    await waitFor(() => expect(mocks.putSettings).toHaveBeenLastCalledWith(0));
  });

  test.each(["", "abc", "1.5", "-1", "101"])(
    "does not send %j, and says what is allowed",
    async (typed) => {
      renderOverview(overviewOf([]));
      const input = await field();
      await userEvent.clear(input);
      if (typed) await userEvent.type(input, typed);
      await userEvent.click(screen.getByRole("button", { name: "Save threshold" }));

      expect(
        await screen.findByText("The threshold must be a whole number from 0 to 100"),
      ).toBeInTheDocument();
      expect(mocks.putSettings).not.toHaveBeenCalled();
      expect(input).toHaveAttribute("aria-invalid", "true");
    },
  );

  test("shows the backend's refusal of a value, and does not pretend it was saved", async () => {
    mocks.putSettings.mockRejectedValueOnce(apiError(400, "invalid_threshold"));
    renderOverview(overviewOf([]));
    const input = await field();
    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.click(screen.getByRole("button", { name: "Save threshold" }));

    expect(
      await screen.findByText("The threshold must be a non-negative whole number within the limit"),
    ).toBeInTheDocument();
    // Nothing was saved, so there is still something to save.
    expect(screen.queryByText("Threshold saved")).toBeNull();
    expect(screen.getByRole("button", { name: "Save threshold" })).toBeEnabled();
  });

  test("a failed read of the setting is shown with a retry", async () => {
    mocks.getSettings.mockRejectedValueOnce(new Error("offline"));
    renderOverview(overviewOf([]));
    const alert = await screen.findByText("Could not load the threshold");
    expect(alert).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await field()).toHaveValue("1");
  });
});
