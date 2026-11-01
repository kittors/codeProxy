import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import {
  ApiError,
  type AlertEventsResponse,
  type AlertSettings,
  type AlertSettingsUpdate,
  type AlertTestResponse,
} from "@code-proxy/api-client";
import { AlertsPage } from "../AlertsPage";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn<() => Promise<Record<string, unknown>>>(),
  getSettings: vi.fn<() => Promise<AlertSettings>>(),
  updateSettings: vi.fn<(body: AlertSettingsUpdate) => Promise<AlertSettings>>(),
  sendTest: vi.fn<(request: unknown) => Promise<AlertTestResponse>>(),
  listEvents: vi.fn<(limit?: number) => Promise<AlertEventsResponse>>(),
  auth: { current: null as { can: (permission: string) => boolean } | null },
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => mocks.auth.current,
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    configApi: { getConfig: mocks.getConfig },
    alertsApi: {
      getSettings: mocks.getSettings,
      updateSettings: mocks.updateSettings,
      sendTest: mocks.sendTest,
      listEvents: mocks.listEvents,
    },
  };
});

const WRITER = { can: () => true };
const READER = { can: (permission: string) => permission === "tenant_settings.read" };

function settings(overrides: Partial<AlertSettings> = {}): AlertSettings {
  return {
    enabled: true,
    language: "en",
    cooldown_minutes: 360,
    channels: [
      {
        id: "ch-ops",
        kind: "webhook",
        name: "Ops",
        enabled: true,
        url: "https://hooks.example.com/****abcd",
        secret: "****",
      },
      {
        id: "ch-team",
        kind: "feishu",
        name: "Team",
        enabled: true,
        url: "https://open.feishu.cn/****wxyz",
      },
      {
        id: "ch-tg",
        kind: "telegram",
        name: "On call",
        enabled: false,
        bot_token: "1234****wxyz",
        chat_id: "-100123",
      },
    ],
    rules: {
      quota_window: { enabled: true, threshold_percent: 90 },
      account_failure: { enabled: true, for_minutes: 10 },
      spending: { enabled: true, threshold_percent: 90 },
      use_it_or_lose_it: { enabled: false, min_remaining_percent: 40, hours_before_reset: 24 },
    },
    updated_at: "2026-11-01T08:00:00Z",
    persistent: true,
    limits: { max_channels: 8 },
    ...overrides,
  };
}

const renderPage = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <AlertsPage />
      </ToastProvider>
    </ThemeProvider>,
  );

const declared = () => mocks.getConfig.mockResolvedValue({ capabilities: { alerts: true } });
const SAVE = { name: "Save", exact: true } as const;

describe("AlertsPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.auth.current = WRITER;
    mocks.getSettings.mockResolvedValue(settings());
    mocks.listEvents.mockResolvedValue({ items: [], total: 0 });
  });

  describe("on a backend that may not have alerts", () => {
    test("explains itself and sends no alert request when alerts are not declared", async () => {
      mocks.getConfig.mockResolvedValue({ debug: false });
      renderPage();
      expect(await screen.findByText("This backend doesn't support alerts")).toBeInTheDocument();
      expect(mocks.getSettings).not.toHaveBeenCalled();
      expect(mocks.listEvents).not.toHaveBeenCalled();
    });

    test("an unreadable declaration is a retryable error, not 'unsupported'", async () => {
      const user = userEvent.setup();
      mocks.getConfig.mockRejectedValueOnce(new Error("network down"));
      renderPage();
      const alert = await screen.findByRole("alert");
      expect(
        within(alert).getByText("Couldn't check whether this backend supports alerts"),
      ).toBeInTheDocument();
      expect(within(alert).getByText("network down")).toBeInTheDocument();
      expect(screen.queryByText("This backend doesn't support alerts")).not.toBeInTheDocument();

      declared();
      await user.click(within(alert).getByRole("button", { name: "Retry" }));
      expect(await screen.findByRole("switch", { name: "Send alerts" })).toBeInTheDocument();
    });
  });

  describe("with alerts declared", () => {
    beforeEach(declared);

    test("lists the channels with masked destinations and keeps stored secrets out of the page", async () => {
      renderPage();
      const rows = await screen.findAllByTestId("alert-channel-row");
      expect(rows).toHaveLength(3);
      expect(within(rows[0]).getByText("Ops")).toBeInTheDocument();
      expect(within(rows[0]).getByText(/hooks\.example\.com\/\*\*\*\*abcd/)).toBeInTheDocument();
      expect(within(rows[2]).getByText(/Chat -100123/)).toBeInTheDocument();
      expect(screen.queryByText(/1234\*\*\*\*wxyz/)).not.toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Send alerts" })).toBeChecked();
    });

    test("saves only what was changed, then is clean again", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockImplementation(async (body) =>
        settings({ enabled: body.enabled ?? true }),
      );
      renderPage();

      const save = await screen.findByRole("button", SAVE);
      expect(save).toBeDisabled();

      await user.click(screen.getByRole("switch", { name: "Send alerts" }));
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      expect(save).toBeEnabled();
      await user.click(save);

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      // The masked secrets of the channels are not in the request: nothing about channels changed.
      expect(mocks.updateSettings).toHaveBeenCalledWith({ enabled: false });
      expect(await screen.findByText("Alert settings saved")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", SAVE)).toBeDisabled());
      expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    });

    test("freezes the form while a save is in flight, so nothing typed meanwhile is overwritten", async () => {
      const user = userEvent.setup();
      let finish: (saved: AlertSettings) => void = () => {};
      mocks.updateSettings.mockImplementation(
        () =>
          new Promise<AlertSettings>((resolve) => {
            finish = resolve;
          }),
      );
      renderPage();
      await user.click(await screen.findByRole("switch", { name: "Send alerts" }));
      await user.click(screen.getByRole("button", SAVE));

      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("switch", { name: "Send alerts" })).toBeDisabled();
      expect(screen.getByLabelText("Repeat cooldown")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Add channel" })).toBeDisabled();

      finish(settings({ enabled: false }));
      await waitFor(() =>
        expect(screen.getByRole("switch", { name: "Send alerts" })).toBeEnabled(),
      );
      expect(screen.getByLabelText("Repeat cooldown")).toBeEnabled();
      expect(screen.getByRole("switch", { name: "Send alerts" })).not.toBeChecked();
    });

    test("discarding puts the saved values back", async () => {
      const user = userEvent.setup();
      renderPage();
      const toggle = await screen.findByRole("switch", { name: "Send alerts" });
      await user.click(toggle);
      expect(toggle).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: "Discard changes" }));
      expect(toggle).toBeChecked();
      expect(screen.getByRole("button", SAVE)).toBeDisabled();
      expect(mocks.updateSettings).not.toHaveBeenCalled();
    });

    test("a rejected save keeps the edits and says which channel is wrong", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockRejectedValue(
        new ApiError({
          message: "channels[0].url: must be an https URL",
          status: 400,
          payload: {
            error: {
              code: "invalid_alert_settings",
              message: "channels[0].url: must be an https URL",
              details: { field: "channels[0].url" },
            },
          },
        }),
      );
      renderPage();
      await user.click(await screen.findByRole("switch", { name: "Send alerts" }));
      await user.click(screen.getByRole("button", SAVE));

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText("Couldn't save the alert settings")).toBeInTheDocument();
      expect(within(alert).getByText("channels[0].url: must be an https URL")).toBeInTheDocument();
      // The same reason sits under the channel it is about.
      const first = screen.getAllByTestId("alert-channel-row")[0];
      expect(within(first).getByText("channels[0].url: must be an https URL")).toBeInTheDocument();
      // Nothing was lost: the switch is still off and the page can try again.
      expect(screen.getByRole("switch", { name: "Send alerts" })).not.toBeChecked();
      expect(screen.getByRole("button", SAVE)).toBeEnabled();
    });

    test("a field that is out of range is marked at once and cannot be saved", async () => {
      const user = userEvent.setup();
      renderPage();
      const cooldown = await screen.findByLabelText("Repeat cooldown");
      await user.clear(cooldown);
      await user.type(cooldown, "5");
      expect(screen.getByText("Enter a whole number from 10 to 10080")).toBeInTheDocument();
      expect(screen.getByRole("button", SAVE)).toBeDisabled();

      await user.clear(cooldown);
      await user.type(cooldown, "720");
      expect(screen.queryByText("Enter a whole number from 10 to 10080")).not.toBeInTheDocument();
      expect(screen.getByRole("button", SAVE)).toBeEnabled();
    });

    test("a rule threshold is checked in place and saved as that one rule", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockResolvedValue(settings());
      renderPage();
      await user.click(await screen.findByRole("tab", { name: "Rules" }));

      const threshold = screen.getAllByLabelText("Usage threshold")[0];
      await user.clear(threshold);
      await user.type(threshold, "0");
      expect(screen.getByText("Enter a whole number from 1 to 100")).toBeInTheDocument();
      expect(screen.getByRole("button", SAVE)).toBeDisabled();

      await user.clear(threshold);
      await user.type(threshold, "95");
      expect(screen.queryByText("Enter a whole number from 1 to 100")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", SAVE));
      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      // The first threshold is the account quota rule's; the others are not in the request.
      expect(mocks.updateSettings).toHaveBeenCalledWith({
        rules: { quota_window: { enabled: true, threshold_percent: 95 } },
      });
    });

    test("a test message goes out as the channel is on the page, masks included", async () => {
      const user = userEvent.setup();
      mocks.sendTest.mockResolvedValue({
        results: [
          {
            channel_id: "ch-ops",
            channel_name: "Ops",
            kind: "webhook",
            ok: true,
            status: "sent",
            error: "",
            duration_ms: 123,
          },
        ],
      });
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Send a test message to Ops" }));

      expect(await screen.findByText("Sent in 123 ms")).toBeInTheDocument();
      expect(mocks.sendTest).toHaveBeenCalledWith({
        channel: {
          id: "ch-ops",
          kind: "webhook",
          name: "Ops",
          enabled: true,
          url: "https://hooks.example.com/****abcd",
          secret: "****",
        },
      });
    });

    test("a failed test shows the backend's reason", async () => {
      const user = userEvent.setup();
      mocks.sendTest.mockResolvedValue({
        results: [
          {
            channel_id: "ch-ops",
            channel_name: "Ops",
            kind: "webhook",
            ok: false,
            status: "failed",
            error: "the receiver answered HTTP 500",
            duration_ms: 80,
          },
        ],
      });
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Send a test message to Ops" }));
      expect(await screen.findByText("Failed: the receiver answered HTTP 500")).toBeInTheDocument();
    });

    test("asks for the recent alerts only once the tab is opened", async () => {
      const user = userEvent.setup();
      mocks.listEvents.mockResolvedValue({
        items: [
          {
            id: "ev-1",
            at: "2026-11-01T07:50:00Z",
            rule: "quota_window",
            severity: "warning",
            subject: { kind: "account", id: "codex-a.json", name: "a@example.com" },
            title: "Codex account is 92% used",
            text: "Codex account is 92% used, resets in 2 days",
            deliveries: [
              {
                channel_id: "ch-ops",
                channel_name: "Ops",
                kind: "webhook",
                status: "sent",
                error: "",
              },
              {
                channel_id: "ch-team",
                channel_name: "Team",
                kind: "feishu",
                status: "failed",
                error: "connection timed out",
              },
            ],
          },
        ],
        total: 12,
      });
      renderPage();
      await screen.findByRole("switch", { name: "Send alerts" });
      expect(mocks.listEvents).not.toHaveBeenCalled();

      await user.click(screen.getByRole("tab", { name: "Recent alerts" }));
      const row = await screen.findByTestId("alert-event-row");
      expect(mocks.listEvents).toHaveBeenCalledTimes(1);
      expect(within(row).getByText("Codex account is 92% used")).toBeInTheDocument();
      expect(within(row).getByText("connection timed out")).toBeInTheDocument();
      expect(screen.getByText("Showing the latest 1 of 12, newest first")).toBeInTheDocument();
    });
  });

  describe("the record of recent alerts", () => {
    beforeEach(declared);

    test("says so when nothing has been sent yet", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("tab", { name: "Recent alerts" }));
      expect(await screen.findByText("No alerts yet")).toBeInTheDocument();
    });

    test("a failed read shows why and can be repeated", async () => {
      const user = userEvent.setup();
      mocks.listEvents.mockRejectedValueOnce(new Error("timeout"));
      renderPage();
      await user.click(await screen.findByRole("tab", { name: "Recent alerts" }));
      expect(await screen.findByText("Couldn't load recent alerts: timeout")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() =>
        expect(screen.queryByText(/Couldn't load recent alerts/)).not.toBeInTheDocument(),
      );
      expect(mocks.listEvents).toHaveBeenCalledTimes(2);
    });
  });

  describe("editing channels", () => {
    beforeEach(declared);

    test("adds a Telegram channel and sends it without an id, next to the untouched ones", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockResolvedValue(settings());
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Add channel" }));

      const dialog = await screen.findByRole("dialog", { name: "Add channel" });
      await user.click(within(dialog).getByRole("combobox", { name: /Type/ }));
      await user.click(await screen.findByRole("option", { name: "Telegram" }));
      await user.type(within(dialog).getByLabelText(/^Name/), "Pager");
      await user.type(within(dialog).getByLabelText(/^Bot token/), "123456:abc-DEF");
      await user.type(within(dialog).getByLabelText(/^Chat ID/), "42");
      await user.click(within(dialog).getByRole("button", { name: "Done" }));

      // Nothing is sent until the page is saved; the row says so.
      expect(mocks.updateSettings).not.toHaveBeenCalled();
      const rows = await screen.findAllByTestId("alert-channel-row");
      expect(rows).toHaveLength(4);
      expect(within(rows[3]).getByText("Pager")).toBeInTheDocument();
      expect(within(rows[3]).getByText("Unsaved")).toBeInTheDocument();
      expect(within(rows[3]).getByText(/Chat 42/)).toBeInTheDocument();
      // The bot token is never printed back.
      expect(screen.queryByText(/123456:abc-DEF/)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", SAVE));
      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      const body = mocks.updateSettings.mock.calls[0][0];
      expect(Object.keys(body)).toEqual(["channels"]);
      expect(body.channels).toHaveLength(4);
      // The saved channels go back exactly as they were read: their masks.
      expect(body.channels?.[0]).toMatchObject({
        id: "ch-ops",
        url: "https://hooks.example.com/****abcd",
        secret: "****",
      });
      expect(body.channels?.[2]).toMatchObject({
        id: "ch-tg",
        bot_token: "1234****wxyz",
        chat_id: "-100123",
      });
      expect(body.channels?.[3]).toEqual({
        kind: "telegram",
        name: "Pager",
        enabled: true,
        bot_token: "123456:abc-DEF",
        chat_id: "42",
      });
    });

    test("will not accept a channel that has nowhere to send to", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Add channel" }));
      const dialog = await screen.findByRole("dialog", { name: "Add channel" });
      await user.click(within(dialog).getByRole("button", { name: "Done" }));

      expect(within(dialog).getByText("Enter a name")).toBeInTheDocument();
      expect(within(dialog).getByText("Enter the address")).toBeInTheDocument();
      expect(screen.getAllByTestId("alert-channel-row")).toHaveLength(3);
    });

    test("a stored address stays out of the input, and the only address of a channel cannot be cleared", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockResolvedValue(settings());
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Edit Ops" }));

      const dialog = await screen.findByRole("dialog", { name: "Edit channel" });
      const address = within(dialog).getByLabelText(/^Webhook URL/);
      expect(address).toHaveValue("");
      expect(address).toHaveAttribute("placeholder", "Set. Leave empty to keep it");
      expect(within(dialog).getByText("https://hooks.example.com/****abcd")).toBeInTheDocument();
      // A saved channel keeps its type: the fields and stored secrets differ per type.
      expect(within(dialog).queryByRole("combobox", { name: /Type/ })).not.toBeInTheDocument();

      await user.click(within(dialog).getAllByRole("button", { name: "Clear" })[0]);
      expect(address).toBeDisabled();
      expect(address).toHaveAttribute("placeholder", "Will be cleared on save");
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      // Clearing the only address of an enabled channel leaves nothing to send to.
      expect(within(dialog).getByText("Enter the address")).toBeInTheDocument();
    });

    test("typing a new address replaces the stored one; leaving it empty keeps it", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockResolvedValue(settings());
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Edit Ops" }));
      let dialog = await screen.findByRole("dialog", { name: "Edit channel" });
      await user.type(
        within(dialog).getByLabelText(/^Webhook URL/),
        "https://hooks.example.com/new",
      );
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // A second channel is opened and closed without touching its address.
      await user.click(screen.getByRole("button", { name: "Edit Team" }));
      dialog = await screen.findByRole("dialog", { name: "Edit channel" });
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", SAVE));
      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      const channels = mocks.updateSettings.mock.calls[0][0].channels;
      expect(channels?.[0]).toMatchObject({
        id: "ch-ops",
        url: "https://hooks.example.com/new",
        secret: "****",
      });
      expect(channels?.[1]).toMatchObject({
        id: "ch-team",
        url: "https://open.feishu.cn/****wxyz",
      });
    });

    test("deleting a channel and switching one off are part of the draft too", async () => {
      const user = userEvent.setup();
      mocks.updateSettings.mockResolvedValue(settings());
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Delete Team" }));
      await user.click(screen.getByRole("switch", { name: "Enable Ops" }));
      expect(screen.getAllByTestId("alert-channel-row")).toHaveLength(2);

      await user.click(screen.getByRole("button", SAVE));
      await waitFor(() => expect(mocks.updateSettings).toHaveBeenCalledTimes(1));
      const channels = mocks.updateSettings.mock.calls[0][0].channels;
      expect(channels?.map((c) => [c.id, c.enabled])).toEqual([
        ["ch-ops", false],
        ["ch-tg", false],
      ]);
    });

    test("warns when alerts are on but every channel is off", async () => {
      mocks.getSettings.mockResolvedValue(
        settings({ channels: settings().channels.map((c) => ({ ...c, enabled: false })) }),
      );
      renderPage();
      expect(
        await screen.findByText(/Alerts are on, but no channel is enabled/),
      ).toBeInTheDocument();
    });

    test("stops adding at the limit the backend reports", async () => {
      mocks.getSettings.mockResolvedValue(settings({ limits: { max_channels: 3 } }));
      renderPage();
      const add = await screen.findByRole("button", { name: "Add channel" });
      expect(add).toBeDisabled();
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });
  });

  describe("when the account or the backend cannot change anything", () => {
    beforeEach(declared);

    test("an account with read access only can look but not edit, test or save", async () => {
      mocks.auth.current = READER;
      renderPage();
      expect(
        await screen.findByText(/You can view the alert settings but not change them/),
      ).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Send alerts" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Add channel" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Send a test message to Ops" })).toBeDisabled();
      expect(screen.getByRole("button", SAVE)).toBeDisabled();
    });

    test("a backend without a settings store is read-only whoever asks", async () => {
      mocks.getSettings.mockResolvedValue(settings({ persistent: false }));
      renderPage();
      expect(await screen.findByText(/has no settings store/)).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Send alerts" })).toBeDisabled();
      expect(screen.getByRole("button", SAVE)).toBeDisabled();
    });
  });

  test("a load failure can be retried", async () => {
    const user = userEvent.setup();
    declared();
    mocks.getSettings.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Couldn't load the alert settings")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("switch", { name: "Send alerts" })).toBeInTheDocument();
    expect(mocks.getSettings).toHaveBeenCalledTimes(2);
  });
});
