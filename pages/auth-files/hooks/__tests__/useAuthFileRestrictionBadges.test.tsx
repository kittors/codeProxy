import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider, toast } from "@code-proxy/ui";
import type { AuthFileItem } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { useAuthFileRestrictionBadges } from "../useAuthFileRestrictionBadges";

const mocks = vi.hoisted(() => ({
  clearModelCooldown: vi.fn(),
  auth: { current: null as null | { can: (permission: string) => boolean } },
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, clearModelCooldown: mocks.clearModelCooldown },
  };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => mocks.auth.current,
}));

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

const codexFile = (extra: Record<string, unknown> = {}): AuthFileItem => ({
  name: "codex-1.json",
  type: "codex",
  auth_index: "auth-1",
  ...extra,
});

const rateLimited = (seconds = 90, extra: Record<string, unknown> = {}) => ({
  scope: "auth",
  status: "error",
  unavailable: true,
  http_status: 429,
  cooldown_reason: "rate_limited",
  next_retry_after: at(seconds),
  ...extra,
});

function Harness({
  file,
  refresh,
}: {
  file: AuthFileItem;
  refresh: (files: AuthFileItem[]) => Promise<AuthFileItem[]>;
}) {
  const { renderRestrictionBadges } = useAuthFileRestrictionBadges({
    nowMs: NOW,
    quotaByFileName: {},
    refreshFilesForItems: refresh,
  });
  return <div>{renderRestrictionBadges(file)}</div>;
}

const renderBadges = (
  file: AuthFileItem,
  refresh: (files: AuthFileItem[]) => Promise<AuthFileItem[]> = vi.fn(async () => []),
) =>
  render(
    <ToastProvider>
      <Harness file={file} refresh={refresh} />
    </ToastProvider>,
  );

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("auth-file-model-cooldown-trigger"));
  return screen.findByRole("menu");
};

const twoCooling = [
  { model: "gpt-5.5", reason: "rate_limited", until: at(120), http_status: 429 },
  { model: "gpt-5.4", reason: "upstream_error", until: at(3700), http_status: 503 },
];

describe("useAuthFileRestrictionBadges", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    // The countdowns read the wall clock themselves (the page clock is not live), so the clock is
    // pinned to the same instant the fixtures are written against. Only Date is faked here:
    // timers stay real so user-event and findBy keep working.
    vi.setSystemTime(NOW);
    // The toast store is global: a toast left over from the previous test must not be on screen.
    toast.dismiss();
    mocks.auth.current = null;
    mocks.clearModelCooldown.mockReset();
    mocks.clearModelCooldown.mockResolvedValue({ changed: true });
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    toast.dismiss();
    await i18n.changeLanguage("en");
  });

  describe("the badge", () => {
    test("names the cause and how long is left", () => {
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
        "Rate limited · 1m 30s",
      );
    });

    test.each([
      ["quota_exhausted", 429, "Quota used up"],
      ["reauth_required", 401, "Re-login required"],
      ["token_refreshing", 401, "Refreshing token"],
      ["unauthorized", 401, "Authorization rejected"],
      ["payment_required", 403, "Billing or access"],
    ])("words %s as %s", (reason, status, expected) => {
      renderBadges(
        codexFile({ restrictions: [rateLimited(30, { http_status: status, cooldown_reason: reason })] }),
      );
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
        `${expected} · 30s`,
      );
    });

    test("keeps the old wording when the backend sends no reason", () => {
      renderBadges(codexFile({ restrictions: [rateLimited(90, { cooldown_reason: undefined })] }));
      const badge = screen.getByTestId("auth-file-restriction-badge");
      expect(badge).toHaveTextContent("429 Error");
      expect(badge).not.toHaveTextContent("·");
    });

    test("keeps the old wording for a reason code this panel does not know", () => {
      renderBadges(codexFile({ restrictions: [rateLimited(90, { cooldown_reason: "from_the_future" })] }));
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent("429 Error");
    });

    test("the tooltip spells out the cause above the upstream details", async () => {
      const user = userEvent.setup();
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      await user.hover(screen.getByTestId("auth-file-restriction-badge"));
      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveTextContent(/^Cause: Rate limited\b/);
      // The existing recovery lines are still there after the new one.
      expect(tooltip).toHaveTextContent(/Recovery in/i);
    });

    test("the tooltip has no cause line when the backend names none", async () => {
      const user = userEvent.setup();
      renderBadges(codexFile({ restrictions: [rateLimited(90, { cooldown_reason: undefined })] }));
      await user.hover(screen.getByTestId("auth-file-restriction-badge"));
      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).not.toHaveTextContent(/Cause/);
    });

    test("shows only the cause when there is no time to wait", () => {
      renderBadges(
        codexFile({
          restrictions: [rateLimited(0, { next_retry_after: undefined, cooldown_reason: "reauth_required", http_status: 401 })],
        }),
      );
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
        /^Re-login required$/,
      );
    });

    test("follows the interface language", async () => {
      await i18n.changeLanguage("zh-CN");
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
        "触发限流 · 1 分 30 秒",
      );
      cleanup();
      await i18n.changeLanguage("ru");
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(screen.getByTestId("auth-file-restriction-badge")).toHaveTextContent(
        /^Лимит запросов · 1м 30с$/,
      );
    });

    test("an account with nothing to show renders nothing", () => {
      const { container } = renderBadges(codexFile());
      expect(container).toHaveTextContent("");
      expect(screen.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });
  });

  describe("the cooling models menu", () => {
    test("an old backend without model_cooldowns offers no retry", () => {
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(screen.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });

    test("lists every cooling model with its cause and time", async () => {
      const user = userEvent.setup();
      renderBadges(codexFile({ model_cooldowns: twoCooling }));
      expect(screen.getByTestId("auth-file-model-cooldown-trigger")).toHaveTextContent(
        "Cooling models: 2",
      );

      const menu = await openMenu(user);
      const items = within(menu).getAllByRole("menuitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("gpt-5.5");
      expect(items[0]).toHaveTextContent("Rate limited · 2m");
      expect(items[1]).toHaveTextContent("gpt-5.4");
      expect(items[1]).toHaveTextContent("Upstream error · 1h 1m");
      expect(within(menu).getByText("Retry a model now")).toBeInTheDocument();
    });

    test("shows a model with no end time and no known cause as plainly as it can", async () => {
      const user = userEvent.setup();
      renderBadges(codexFile({ model_cooldowns: [{ model: "gpt-5.5" }] }));
      const menu = await openMenu(user);
      expect(within(menu).getByRole("menuitem")).toHaveTextContent("no end time");
    });

    test("hides a cooldown whose time has already passed", () => {
      renderBadges(
        codexFile({ model_cooldowns: [{ model: "gpt-5.5", reason: "rate_limited", until: at(-5) }] }),
      );
      expect(screen.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });

    test("is not offered for a shared account, which is read-only", () => {
      renderBadges(codexFile({ shared: true, model_cooldowns: twoCooling }));
      expect(screen.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });

    test("is not offered for an entry the backend could not look up", () => {
      renderBadges(codexFile({ auth_index: undefined, model_cooldowns: twoCooling }));
      expect(screen.queryByTestId("auth-file-model-cooldown-trigger")).not.toBeInTheDocument();
    });

    test("shows next to the restriction badges", () => {
      renderBadges(codexFile({ restrictions: [rateLimited(90)], model_cooldowns: twoCooling }));
      expect(screen.getByTestId("auth-file-restriction-badge")).toBeInTheDocument();
      expect(screen.getByTestId("auth-file-model-cooldown-trigger")).toBeInTheDocument();
    });
  });

  describe("countdowns run on their own clock", () => {
    // The Harness hands the hook a page clock that never moves, like a page with quota auto-refresh
    // off (the default). Only the chips themselves can make time pass. Date and the interval are
    // faked; setTimeout stays real so user-event and findBy keep working.
    const fakeClock = () =>
      vi.useFakeTimers({ now: NOW, toFake: ["Date", "setInterval", "clearInterval"] });
    const tick = (ms: number) =>
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    const badge = () => screen.queryByTestId("auth-file-restriction-badge");

    test("the badge counts down even though the page clock stands still", () => {
      fakeClock();
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(badge()).toHaveTextContent("Rate limited · 1m 30s");
      tick(31_000);
      expect(badge()).toHaveTextContent("Rate limited · 59s");
      tick(58_000);
      expect(badge()).toHaveTextContent("Rate limited · 1s");
    });

    test("the badge goes away when its cooldown ends, as a reload would show", () => {
      fakeClock();
      renderBadges(codexFile({ restrictions: [rateLimited(5)] }));
      tick(4_000);
      expect(badge()).toHaveTextContent("Rate limited · 1s");
      tick(1_000);
      expect(badge()).not.toBeInTheDocument();
    });

    test("only a badge that shows a time keeps a timer", () => {
      fakeClock();
      const plain = renderBadges(
        codexFile({ restrictions: [rateLimited(90, { cooldown_reason: undefined })] }),
      );
      expect(vi.getTimerCount()).toBe(0);
      plain.unmount();
      const cooling = renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      expect(vi.getTimerCount()).toBe(1);
      cooling.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    test("a reason with no time to wait has nothing to count down", () => {
      fakeClock();
      renderBadges(
        codexFile({
          restrictions: [
            rateLimited(0, {
              next_retry_after: undefined,
              cooldown_reason: "reauth_required",
              http_status: 401,
            }),
          ],
        }),
      );
      expect(badge()).toHaveTextContent("Re-login required");
      expect(vi.getTimerCount()).toBe(0);
    });

    test("a badge without a reason does not disappear by itself, it never did", () => {
      fakeClock();
      renderBadges(codexFile({ restrictions: [rateLimited(5, { cooldown_reason: undefined })] }));
      tick(60_000);
      expect(badge()).toHaveTextContent("429 Error");
    });

    test("the tooltip counts against the same clock as the badge", () => {
      fakeClock();
      renderBadges(codexFile({ restrictions: [rateLimited(90)] }));
      fireEvent.mouseEnter(screen.getByTestId("auth-file-restriction-badge"));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("Auto recovery in 1m 30s");
      tick(35_000);
      expect(tooltip).toHaveTextContent("Auto recovery in 55s");
      expect(badge()).toHaveTextContent("Rate limited · 55s");
    });

    test("the tooltip of a badge without a reason counts down while it is open too", () => {
      fakeClock();
      renderBadges(codexFile({ restrictions: [rateLimited(90, { cooldown_reason: undefined })] }));
      fireEvent.mouseEnter(screen.getByTestId("auth-file-restriction-badge"));
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("Auto recovery in 1m 30s");
      tick(35_000);
      expect(tooltip).toHaveTextContent("Auto recovery in 55s");
      // The badge itself never showed a time, so it still reads the way it always did.
      expect(badge()).toHaveTextContent("429 Error");
    });

    test("the models in the menu count down and drop out when they end", () => {
      fakeClock();
      renderBadges(codexFile({ model_cooldowns: twoCooling }));
      const trigger = () => screen.queryByTestId("auth-file-model-cooldown-trigger");
      expect(trigger()).toHaveTextContent("Cooling models: 2");
      tick(119_000);
      expect(trigger()).toHaveTextContent("Cooling models: 2");
      // The first model ends exactly now: it is over, not "1s left".
      tick(1_000);
      expect(trigger()).toHaveTextContent("Cooling models: 1");
      tick(3_600_000);
      expect(trigger()).not.toBeInTheDocument();
    });

    test("an open menu shows the time left now, not the time left when it was drawn", async () => {
      fakeClock();
      const user = userEvent.setup();
      renderBadges(codexFile({ model_cooldowns: twoCooling }));
      const menu = await openMenu(user);
      const first = () => within(menu).getAllByRole("menuitem")[0]!;
      expect(first()).toHaveTextContent("Rate limited · 2m");
      tick(30_000);
      expect(first()).toHaveTextContent("Rate limited · 1m 30s");
    });
  });

  describe("retrying one model", () => {
    test("clears that model on that account, reloads the account and says so", async () => {
      const user = userEvent.setup();
      const refresh = vi.fn(async (files: AuthFileItem[]) => files);
      const file = codexFile({ model_cooldowns: twoCooling });
      renderBadges(file, refresh);

      const menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));

      await waitFor(() => expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1));
      expect(mocks.clearModelCooldown).toHaveBeenCalledWith({ authIndex: "auth-1", model: "gpt-5.5" });
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(refresh).toHaveBeenCalledWith([file]);
      expect(await screen.findByText('"gpt-5.5" on "codex-1.json" can be tried again now')).toBeInTheDocument();
    });

    test("uses the account's display name in the message", async () => {
      const user = userEvent.setup();
      renderBadges(codexFile({ label: "Team Codex", model_cooldowns: twoCooling }));
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.4 now/ }));
      expect(await screen.findByText(/"gpt-5\.4" on "Team Codex"/)).toBeInTheDocument();
    });

    test("tells the user when the model had already recovered", async () => {
      const user = userEvent.setup();
      mocks.clearModelCooldown.mockResolvedValue({ changed: false });
      renderBadges(codexFile({ model_cooldowns: twoCooling }));
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));
      expect(
        await screen.findByText('"gpt-5.5" on "codex-1.json" was no longer cooling down'),
      ).toBeInTheDocument();
    });

    test("reports a failure with the server's message and does not reload", async () => {
      const user = userEvent.setup();
      mocks.clearModelCooldown.mockRejectedValue(new Error("auth not found"));
      const refresh = vi.fn(async (files: AuthFileItem[]) => files);
      renderBadges(codexFile({ model_cooldowns: twoCooling }), refresh);
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));
      expect(
        await screen.findByText('Failed to retry "gpt-5.5" on "codex-1.json": auth not found'),
      ).toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    test("a second click on the same model while it is retrying sends nothing", async () => {
      const user = userEvent.setup();
      let finish: (value: { changed: boolean }) => void = () => undefined;
      mocks.clearModelCooldown.mockReturnValue(
        new Promise<{ changed: boolean }>((resolve) => {
          finish = resolve;
        }),
      );
      renderBadges(codexFile({ model_cooldowns: twoCooling }));

      let menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));
      await waitFor(() => expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1));

      menu = await openMenu(user);
      const busy = within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ });
      expect(busy).toHaveAttribute("aria-disabled", "true");
      await user.click(busy);
      // The other model is still free to retry while this one is in flight.
      expect(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.4 now/ })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1);

      finish({ changed: true });
      await waitFor(() => expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1));
    });
  });

  describe("without write permission", () => {
    test("lists the models but cannot retry them", async () => {
      const user = userEvent.setup();
      mocks.auth.current = { can: (permission) => permission !== "auth_files.write" };
      renderBadges(codexFile({ model_cooldowns: twoCooling }));

      const menu = await openMenu(user);
      expect(within(menu).getByText("Models held back on this account")).toBeInTheDocument();
      const items = within(menu).getAllByRole("menuitem");
      expect(items).toHaveLength(2);
      for (const item of items) expect(item).toHaveAttribute("aria-disabled", "true");
      await user.click(items[0]!);
      expect(mocks.clearModelCooldown).not.toHaveBeenCalled();
    });

    test("with the permission the same menu retries", async () => {
      const user = userEvent.setup();
      mocks.auth.current = { can: (permission) => permission === "auth_files.write" };
      renderBadges(codexFile({ model_cooldowns: twoCooling }));
      const menu = await openMenu(user);
      await user.click(within(menu).getByRole("menuitem", { name: /Retry gpt-5\.5 now/ }));
      await waitFor(() => expect(mocks.clearModelCooldown).toHaveBeenCalledTimes(1));
    });
  });
});
