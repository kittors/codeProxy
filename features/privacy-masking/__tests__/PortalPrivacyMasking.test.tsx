import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PortalPrivacyMaskSettings, PrivacyMaskPolicy } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { PrivacyMaskingWorkspace } from "../PrivacyMaskingWorkspace";

/**
 * 门户里的隐私脱敏，只读：门户用户看自己请求遮了什么、租户管理员定的规则，用试一试看效果；要不要
 * 脱敏、遮什么全由管理员决定，门户里没有任何设置入口。接口按模块替换成假的。
 */

const portal = vi.hoisted(() => ({
  getSummary: vi.fn(),
  listRecords: vi.fn(),
  getRecord: vi.fn(),
  getSettings: vi.fn(),
  preview: vi.fn(),
}));
const tenant = vi.hoisted(() => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  getSummary: vi.fn(),
  listRecords: vi.fn(),
  preview: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  privacyMaskingPortalApi: portal,
  privacyMaskingApi: tenant,
}));

// 线上渠道名常是 OAuth 账号邮箱，门户里不能出现
const CHANNEL = "k3v9x2mq7z@privaterelay.appleid.com";

const policy = (patch: Partial<PrivacyMaskPolicy> = {}): PrivacyMaskPolicy => ({
  secrets: true,
  personal: false,
  kinds: {},
  // 门户拿到的是租户设置，脱敏词、规则和「从不脱敏」被服务器清空
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
  updated_at: "2026-11-05T08:00:00Z",
  ...patch,
});

const EMPTY_SUMMARY = {
  days: [],
  places: 0,
  distinct: 0,
  requests: 0,
  blocked: 0,
  warned: 0,
  kinds: [],
  clients: [],
  channels: [],
  values: [],
};

const SUMMARY = {
  ...EMPTY_SUMMARY,
  days: [{ day: "2026-11-05", places: 30, requests: 3 }],
  places: 30,
  distinct: 2,
  requests: 3,
  kinds: [{ kind: "API_KEY", places: 30, distinct: 2 }],
  clients: [{ name: "codex", places: 30, requests: 3 }],
  channels: [
    { name: CHANNEL, places: 20, requests: 2, vendor: "codex" },
    { name: "土豆 Codex 池", places: 6, requests: 1, vendor: "codex" },
    { name: "my-relay", places: 4, requests: 1, vendor: "my-relay" },
  ],
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
        <PrivacyMaskingWorkspace scope="portal" canWrite={false} />
      </ToastProvider>
    </ThemeProvider>,
  );

const openRules = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("tab", { name: "Rules in effect" }));
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

  test("lists the tenant's rules read-only: what is masked and how each kind is handled", async () => {
    const user = userEvent.setup();
    portal.getSettings.mockResolvedValue(
      view({
        policy: policy({
          personal: true,
          kinds: { ip: true, ssn: false },
          actions: { API_KEY: "warn", EMAIL: "block", TERM: "block", GATEWAY_KEY: "warn" },
        }),
      }),
    );
    renderPortal();
    await openRules(user);

    expect(
      await screen.findByRole("heading", { name: "Masking rules on your requests" }),
    ).toBeInTheDocument();
    // 只读：没有开关、没有保存；也没有「管理员强制」这回事
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByText("Turned on by an administrator")).not.toBeInTheDocument();

    const [secretActions, personalActions, otherActions] = screen.getAllByRole("list", {
      name: "When a value is found",
    });
    expect(within(secretActions).getByText("API key").closest("li")).toHaveTextContent("Warn");
    expect(within(secretActions).getByText("Private key").closest("li")).toHaveTextContent("Mask");
    expect(within(personalActions).getByText("Email").closest("li")).toHaveTextContent("Block");
    const categories = screen.getByRole("list", { name: "Other personal data masked" });
    expect(within(categories).getByText("Public IP addresses")).toBeInTheDocument();
    expect(within(categories).queryByText("Social Security numbers")).not.toBeInTheDocument();
    expect(within(categories).getByText("Passport numbers")).toBeInTheDocument();
    // 管理员的脱敏词和规则不显示内容，只说明有可能存在，以及命中时怎么处理
    expect(
      screen.getByText(
        "Your administrator may also have set masked words and rules of their own, which aren't shown to you.",
      ),
    ).toBeInTheDocument();
    expect(within(otherActions).getByText("Masked word").closest("li")).toHaveTextContent("Block");
    expect(within(otherActions).getByText("GATEWAY_KEY").closest("li")).toHaveTextContent("Warn");
  });

  test("tries a text out with nothing but the text", async () => {
    const user = userEvent.setup();
    renderPortal();
    await openRules(user);

    await user.type(await screen.findByRole("textbox", { name: "Try it" }), "sk-proj-abc");
    await waitFor(() => expect(portal.preview).toHaveBeenCalled());
    expect(portal.preview.mock.calls[0]).toEqual(["sk-proj-abc"]);
    expect(await screen.findByText("Upstream would get")).toBeInTheDocument();
    expect(tenant.preview).not.toHaveBeenCalled();
  });

  test("says masking isn't on, with no way to turn it on, when there is nothing to show", async () => {
    portal.getSummary.mockResolvedValue(EMPTY_SUMMARY);
    portal.listRecords.mockResolvedValue({ items: [] });
    portal.getSettings.mockResolvedValue(view({ policy: policy({ secrets: false }) }));
    renderPortal();

    expect(await screen.findByText("Masking isn't on for your requests")).toBeInTheDocument();
    expect(screen.getByText(/Your administrator decides whether it's on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on masking" })).not.toBeInTheDocument();
  });

  test("says so when masking is switched off on the server, whatever the rules say", async () => {
    portal.getSettings.mockResolvedValue(view({ server_disabled: true }));
    renderPortal();

    expect(
      await screen.findByText(/Masking is switched off on the server for now/),
    ).toBeInTheDocument();
    // 规则里开着密钥，但服务器没在遮：头卡不能写「脱敏中」
    const card = screen.getByRole("heading", { name: "Kept from upstream" }).closest("section")!;
    expect(within(card).getByText("Off")).toBeInTheDocument();
  });
});
