import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApiError,
  type PortalPrivacyMaskSettings,
  type PrivacyMaskPolicy,
} from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { PrivacyMaskingWorkspace } from "../PrivacyMaskingWorkspace";

/**
 * 门户里的隐私脱敏：门户用户自己的记录与设置。接口按模块替换成假的，只看门户这一套怎么用：
 * 只写自己的设置、能恢复管理员的默认、被收回权限时只读、强制的类目改不掉，以及渠道名不出现。
 */

const portal = vi.hoisted(() => ({
  getSummary: vi.fn(),
  listRecords: vi.fn(),
  getRecord: vi.fn(),
  clearRecords: vi.fn(),
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  resetSettings: vi.fn(),
  preview: vi.fn(),
}));
const tenant = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getSummary: vi.fn(),
  listRecords: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  portalPrivacyMaskingApi: portal,
  privacyMaskingApi: tenant,
}));

// 线上渠道名常是 OAuth 账号邮箱，门户里不能出现
const CHANNEL = "k3v9x2mq7z@privaterelay.appleid.com";

const policy = (patch: Partial<PrivacyMaskPolicy> = {}): PrivacyMaskPolicy => ({
  secrets: true,
  personal: false,
  kinds: {},
  words: [],
  words_any_case: false,
  words_whole: false,
  rules: [],
  allow: [],
  actions: {},
  ...patch,
});

const view = (patch: Partial<PortalPrivacyMaskSettings> = {}): PortalPrivacyMaskSettings => ({
  policy: policy(),
  own: false,
  allowed: true,
  enforced: [],
  portal_default_allowed: true,
  persistent: true,
  updated_at: "",
  ...patch,
});

const SUMMARY = {
  days: [{ day: "2026-11-05", places: 30, requests: 3 }],
  places: 30,
  distinct: 2,
  requests: 3,
  blocked: 0,
  warned: 0,
  kinds: [{ kind: "API_KEY", places: 30, distinct: 2 }],
  clients: [{ name: "codex", places: 30, requests: 3 }],
  channels: [
    { name: CHANNEL, places: 20, requests: 2, vendor: "codex" },
    { name: "土豆 Codex 池", places: 6, requests: 1, vendor: "codex" },
    { name: "my-relay", places: 4, requests: 1, vendor: "my-relay" },
  ],
  values: [],
};

const RECORDS = [
  {
    key: "a00000000000000000000001",
    at: new Date().toISOString(),
    client: "codex",
    channel: CHANNEL,
    provider: "codex",
    model: "gpt-5-codex",
    places: 20,
    distinct: 1,
    values: [{ kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 20 }],
  },
];

const renderPortal = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <PrivacyMaskingWorkspace scope="portal" canWrite />
      </ToastProvider>
    </ThemeProvider>,
  );

const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("tab", { name: "My settings" }));
};

describe("privacy masking in the portal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    portal.getSummary.mockResolvedValue(SUMMARY);
    portal.listRecords.mockResolvedValue({ items: RECORDS });
    portal.getRecord.mockResolvedValue({ ...RECORDS[0], snippets: [] });
    portal.getSettings.mockResolvedValue(view());
    portal.preview.mockResolvedValue({ text: "{{API_KEY_abcdefgh}}", values: [], blocked: false });
  });

  test("shows the account's own records with upstream vendors, never channel names", async () => {
    renderPortal();

    // 记录里的渠道换成厂商名
    expect(await screen.findByRole("button", { name: /gpt-5-codex/ })).toHaveTextContent("OpenAI");
    // 流向图右边三个渠道合成两家：认得的按厂商名，运营方自己起名的 OpenAI 兼容渠道归「其他上游」；
    // 接口没法按厂商筛选，所以只显示、不能点
    const flow = await screen.findByRole("figure");
    expect(within(flow).getByRole("button", { name: /OpenAI/ })).toBeDisabled();
    expect(within(flow).getByRole("button", { name: /Other upstreams/ })).toBeDisabled();
    expect(within(flow).getByRole("button", { name: /Codex/ })).toBeEnabled();
    expect(screen.queryByText(CHANNEL)).not.toBeInTheDocument();
    expect(screen.queryByText("土豆 Codex 池")).not.toBeInTheDocument();
    expect(screen.queryByText("my-relay")).not.toBeInTheDocument();
    // 只走门户的接口
    expect(portal.listRecords).toHaveBeenCalled();
    expect(tenant.listRecords).not.toHaveBeenCalled();
    expect(tenant.getSettings).not.toHaveBeenCalled();
    // 致谢 magpie 门户里同样显示
    expect(screen.getByRole("link", { name: "magpie" })).toHaveAttribute(
      "href",
      "https://github.com/yetone/magpie",
    );
  });

  test("an account on its administrator's defaults saves only its own policy", async () => {
    const user = userEvent.setup();
    portal.putSettings.mockImplementation(async (next: PrivacyMaskPolicy) =>
      view({ policy: next, own: true, updated_at: "2026-11-05T10:00:00Z" }),
    );
    renderPortal();
    await openSettings(user);

    expect(
      await screen.findByText("You're on your administrator's default settings"),
    ).toBeInTheDocument();
    expect(screen.getByText(/aren't shown here/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore defaults" })).not.toBeInTheDocument();
    // 控制台才有的「管理」一组不出现
    expect(screen.queryByText("Portal users can choose their own")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Mask personal data" }));
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    await user.click(within(bar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(portal.putSettings).toHaveBeenCalledTimes(1));
    expect(portal.putSettings.mock.calls[0]).toEqual([policy({ personal: true })]);
    expect(await screen.findByText("You're using your own settings")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  test("goes back to the administrator's defaults after asking", async () => {
    const user = userEvent.setup();
    portal.getSettings.mockResolvedValue(
      view({ own: true, policy: policy({ personal: true }), updated_at: "2026-11-05T10:00:00Z" }),
    );
    portal.resetSettings.mockResolvedValue(view({ updated_at: "2026-11-05T10:00:00Z" }));
    renderPortal();
    await openSettings(user);

    await user.click(await screen.findByRole("button", { name: "Restore defaults" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Go back to your administrator's default settings?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Restore defaults" }));

    await waitFor(() => expect(portal.resetSettings).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("You're on your administrator's default settings"),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mask personal data" })).not.toBeChecked();
  });

  test("is read-only, and says why, when the administrator has not allowed it", async () => {
    const user = userEvent.setup();
    portal.getSettings.mockResolvedValue(view({ allowed: false, portal_default_allowed: false }));
    renderPortal();
    await openSettings(user);

    expect(
      await screen.findByText("Your administrator has not opened privacy masking to you"),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Mask secrets" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Mask personal data" })).toBeDisabled();
    // 试一试照样能用：看自己的请求会被怎样遮
    await user.type(screen.getByRole("textbox", { name: "Try it" }), "sk-proj-abc");
    await waitFor(() => expect(portal.preview).toHaveBeenCalledWith("sk-proj-abc", policy()));
    // 概览头卡关着时给的是「查看设置」，不是改不了的「去开启」
    expect(portal.putSettings).not.toHaveBeenCalled();
  });

  test("turns read-only when the administrator takes the permission back while the page is open", async () => {
    const user = userEvent.setup();
    portal.getSettings
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ allowed: false, portal_default_allowed: false }));
    portal.putSettings.mockRejectedValue(
      new ApiError({
        message: "forbidden",
        status: 403,
        payload: { error: { code: "privacy_masking_portal_forbidden", message: "no" } },
      }),
    );
    renderPortal();
    await openSettings(user);

    await user.click(await screen.findByRole("switch", { name: "Mask personal data" }));
    await user.click(
      within(await screen.findByRole("region", { name: "Unsaved changes" })).getByRole("button", {
        name: "Save",
      }),
    );

    expect(
      await screen.findByText("Your administrator has not opened privacy masking to you"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/has just stopped letting you change privacy masking/),
    ).toBeInTheDocument();
    expect(portal.getSettings).toHaveBeenCalledTimes(2);
    // 草稿换成了生效的设置，不留一个存不进去的保存栏
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  test("keeps the kinds the administrator enforces on, and never sent as written", async () => {
    const user = userEvent.setup();
    portal.getSettings.mockResolvedValue(
      view({
        own: true,
        enforced: ["secrets"],
        policy: policy({ secrets: false, actions: { API_KEY: "warn" } }),
      }),
    );
    renderPortal();
    await openSettings(user);

    const secrets = await screen.findByRole("switch", { name: "Mask secrets" });
    expect(secrets).toBeChecked();
    expect(secrets).toBeDisabled();
    expect(screen.getAllByText("Turned on by an administrator").length).toBeGreaterThan(0);
    // 存着的「提醒」按服务器的合并显示成脱敏，提醒这一项不能选
    const apiKey = screen.getByRole("radiogroup", { name: "API key" });
    expect(within(apiKey).getByRole("radio", { name: "Mask" })).toBeChecked();
    expect(within(apiKey).getByRole("radio", { name: "Warn" })).toBeDisabled();
    expect(
      screen.getByText(/still masked if it is of a kind your administrator turned on/),
    ).toBeInTheDocument();
  });
});
