import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider, toast } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { ApiClientError, type AccessFreeze, type AccessFreezeStrike } from "@code-proxy/api-client";
import { AccessFreezeDetailModal } from "../AccessFreezeDetailModal";
import type { AccessFreezeSubjectRef } from "../format";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  strikes: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  accessFreezesApi: { list: mocks.list, strikes: mocks.strikes, release: mocks.release },
}));

const alice: AccessFreezeSubjectRef = { kind: "end_user", id: "user-1", name: "Alice / alice" };

const standing: AccessFreeze = {
  id: 7,
  subject: { tenant_id: "t1", kind: "end_user", id: "user-1" },
  subject_name: "Alice",
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: "This content was flagged for possible cybersecurity risk.",
  model: "gpt-6.1-sol",
  auth_label: "codex-team-a.json",
  request_id: "req-7f3a",
  strike_count: 3,
  frozen_at: "2026-11-13T02:00:00Z",
  notice: "Access to Codex is frozen for this account. 本账号的 Codex 使用权限已冻结。",
};

const releasedBefore: AccessFreeze = {
  ...standing,
  id: 4,
  provider: "claude",
  provider_name: "Claude",
  strike_count: 1,
  frozen_at: "2026-11-10T02:00:00Z",
  released_at: "2026-11-11T02:00:00Z",
  released_by: "admin",
  release_note: "Confirmed with the user.",
};

const strike: AccessFreezeStrike = {
  id: 21,
  subject: standing.subject,
  provider: "codex",
  provider_name: "Codex",
  reason_code: "cyber_policy",
  upstream_message: "Flagged: possible cybersecurity risk",
  model: "gpt-6.1-sol",
  auth_label: "codex-team-a.json",
  request_id: "req-9c1d",
  created_at: "2026-11-13T01:59:00Z",
};

const apiError = (status: number, code: string) =>
  new ApiClientError({ message: code, status, data: { error: { code, message: code } } });

function renderModal(props: Partial<React.ComponentProps<typeof AccessFreezeDetailModal>> = {}) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <ThemeProvider>
      <ToastProvider>
        <AccessFreezeDetailModal
          subject={alice}
          canWrite
          onClose={onClose}
          onChanged={onChanged}
          {...props}
        />
      </ToastProvider>
    </ThemeProvider>,
  );
  return { onClose, onChanged };
}

describe("AccessFreezeDetailModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.list.mockResolvedValue([standing, releasedBefore]);
    mocks.strikes.mockResolvedValue([strike]);
    mocks.release.mockResolvedValue({ ...standing, released_at: "2026-11-13T03:00:00Z" });
  });

  afterEach(async () => {
    // The toast store outlives a test: a toast left over would turn up in the next one's screen.
    toast.dismiss();
    await i18n.changeLanguage("zh-CN");
  });

  test("puts the freezes in effect first, then the ones released, then the refusals behind them", async () => {
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    // The requester is named as the backend takes it, and the whole history is asked for.
    expect(mocks.list).toHaveBeenCalledWith({
      status: "all",
      subjectKind: "end_user",
      subjectId: "user-1",
      limit: 200,
    });
    expect(mocks.strikes).toHaveBeenCalledWith({
      subjectKind: "end_user",
      subjectId: "user-1",
      limit: 200,
    });

    const headings = (await within(dialog).findAllByRole("heading", { level: 3 })).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(["In effect", "Released", "Refusals by the upstream"]);

    // A freeze in effect: what the upstream said, which model, which upstream account and request.
    expect(
      within(dialog).getByText("This content was flagged for possible cybersecurity risk."),
    ).toBeInTheDocument();
    // The model and the upstream account are on the card and again on the refusal behind it.
    expect(within(dialog).getAllByText("gpt-6.1-sol")).toHaveLength(2);
    expect(within(dialog).getAllByText("codex-team-a.json")).toHaveLength(2);
    expect(within(dialog).getByText("req-7f3a")).toBeInTheDocument();
    expect(within(dialog).getByText("Refusals: 3")).toBeInTheDocument();
    // What the user was told is there, folded away.
    expect(within(dialog).getByText("What the user is told")).toBeInTheDocument();

    // A release: who, when and the note left.
    expect(within(dialog).getByText(/Released .* by admin/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Confirmed with the user\./)).toBeInTheDocument();

    // The evidence table.
    const table = within(dialog).getByRole("table");
    expect(within(table).getByText("Flagged: possible cybersecurity risk")).toBeInTheDocument();
    expect(within(table).getByText("req-9c1d")).toBeInTheDocument();
  });

  test("releases a freeze with a note, then reads again and tells the page", async () => {
    const { onChanged } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Release" }));

    const confirm = await screen.findByRole("dialog", { name: "Release the freeze" });
    // Says what will happen, to whom, and that the count starts over.
    expect(
      within(confirm).getByText("Every key of Alice / alice can use Codex again."),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByText(
        "Refusals are counted afresh from now; reaching the threshold again freezes it again.",
      ),
    ).toBeInTheDocument();

    await userEvent.type(
      within(confirm).getByRole("textbox", { name: /Note/ }),
      "  ok, confirmed  ",
    );
    await userEvent.click(within(confirm).getByRole("button", { name: "Release" }));

    await waitFor(() => expect(mocks.release).toHaveBeenCalledWith(7, "  ok, confirmed  "));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    // The detail reads again so the released freeze moves to the history.
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Codex released")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Release the freeze" })).toBeNull(),
    );
  });

  test("a freeze somebody else released a moment ago is not an error to retry: it just refreshes", async () => {
    mocks.release.mockRejectedValueOnce(apiError(409, "access_freeze_already_released"));
    const { onChanged } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Release" }));
    const confirm = await screen.findByRole("dialog", { name: "Release the freeze" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Release" }));

    expect(await screen.findByText("This freeze has already been released")).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Release the freeze" })).toBeNull(),
    );
  });

  test("another failure stays in the dialog so it can be tried again", async () => {
    mocks.release.mockRejectedValueOnce(new Error("database is down"));
    const { onChanged } = renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Release" }));
    const confirm = await screen.findByRole("dialog", { name: "Release the freeze" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Release" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent("database is down");
    expect(onChanged).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole("button", { name: "Release" }));
    await waitFor(() => expect(mocks.release).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  test("offers no release without the permission to write", async () => {
    renderModal({ canWrite: false });
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    await within(dialog).findByText("This content was flagged for possible cybersecurity risk.");
    expect(within(dialog).queryByRole("button", { name: "Release" })).toBeNull();
  });

  test("a key no portal account owns is asked for as a key, and says the key itself is frozen", async () => {
    renderModal({ subject: { kind: "api_key", id: "key-9", name: "Key 0123abcd" } });
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Key 0123abcd" });
    expect(within(dialog).getByText(/No portal account owns this key/)).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith({
        status: "all",
        subjectKind: "api_key",
        subjectId: "key-9",
        limit: 200,
      }),
    );
  });

  test("says when nothing is in effect and nothing was ever refused", async () => {
    mocks.list.mockResolvedValue([releasedBefore]);
    mocks.strikes.mockResolvedValue([]);
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    expect(await within(dialog).findByText("No freezes in effect")).toBeInTheDocument();
    expect(
      within(dialog).getByText("No upstream has refused a request from this one"),
    ).toBeInTheDocument();
  });

  test("a failed read is shown with a way to retry", async () => {
    mocks.list.mockRejectedValueOnce(new Error("offline"));
    renderModal();
    const dialog = await screen.findByRole("dialog", { name: "Upstream freezes · Alice / alice" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not load the upstream freezes");
    expect(alert).toHaveTextContent("offline");

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await within(dialog).findByText("In effect")).toBeInTheDocument();
  });

  test("shows nothing of the last requester while the next one loads", async () => {
    const view = render(
      <ThemeProvider>
        <ToastProvider>
          <AccessFreezeDetailModal subject={alice} canWrite onClose={vi.fn()} onChanged={vi.fn()} />
        </ToastProvider>
      </ThemeProvider>,
    );
    await screen.findByText("This content was flagged for possible cybersecurity risk.");

    mocks.list.mockImplementationOnce(() => new Promise(() => undefined));
    view.rerender(
      <ThemeProvider>
        <ToastProvider>
          <AccessFreezeDetailModal
            subject={{ kind: "end_user", id: "user-2", name: "Bob" }}
            canWrite
            onClose={vi.fn()}
            onChanged={vi.fn()}
          />
        </ToastProvider>
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByText("This content was flagged for possible cybersecurity risk."),
      ).toBeNull(),
    );
  });
});
