import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError, type WordPolicyView } from "@code-proxy/api-client";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { PortalWordsTab } from "../PortalWordsTab";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  validate: vi.fn(),
  test: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  portalWordPolicyApi: mocks,
}));

const DEFAULTS = {
  action: "block" as const,
  replacement: "***",
  scan_scope: "all_user" as const,
  block_message: "Blocked.",
  reply_filter: false,
  fold_traditional_chinese: false,
};

const LIMITS = {
  max_rules: 1000,
  max_regex: 10,
  max_keyword_chars: 128,
  max_regex_bytes: 512,
  max_regex_program: 500,
  max_regex_program_total: 2000,
  max_note_chars: 200,
  max_replacement_chars: 64,
  max_block_message_chars: 500,
};

const ownView = (patch: Partial<WordPolicyView> = {}) => ({
  exists: true,
  scope_type: "end_user" as const,
  scope_id: "u1",
  enabled: true,
  action: "" as const,
  replacement: "",
  scan_scope: "" as const,
  reply_filter: null,
  fold_traditional_chinese: null,
  inherit_tenant: true,
  block_message: "",
  version: 2,
  rules: [{ id: "a1", kind: "keyword" as const, pattern: "rival", enabled: true }],
  effective: DEFAULTS,
  rule_count: 1,
  rules_hidden: false,
  unbounded_regex_ids: [],
  can_edit: true,
  limits: LIMITS,
  defaults: DEFAULTS,
  guard_enabled: true,
  ...patch,
});

const renderTab = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <PortalWordsTab />
      </ToastProvider>
    </ThemeProvider>,
  );

describe("the portal's sensitive-word tab", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.get.mockResolvedValue(ownView());
    mocks.put.mockImplementation(async (input: { rules: Array<{ pattern: string }> }) =>
      ownView({ version: 3, rules: input.rules.map((rule, index) => ({ ...rule, id: `n${index}`, kind: "keyword", enabled: true })) }),
    );
  });

  test("lets the account add its own words and keeps to its own, smaller limit", async () => {
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByRole("heading", { name: "My sensitive words" })).toBeInTheDocument();
    expect(screen.getByText("rival")).toBeInTheDocument();
    expect(screen.getByText(/Rules: 1 of 1000 · Regular expressions: 0 of 10/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Add sensitive words" }), "codename, secret{Enter}");
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    await user.click(within(bar).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    const [input] = mocks.put.mock.calls[0];
    expect(input.version).toBe(2);
    expect(input.rules.map((rule: { pattern: string }) => rule.pattern)).toEqual(["codename", "secret", "rival"]);
  });

  test("tests the account's own words only, with the draft when there is one", async () => {
    const user = userEvent.setup();
    mocks.test.mockResolvedValue({
      action: "allow",
      blocked: false,
      output: "hello",
      matches: [],
      match_count: 0,
      replaced: 0,
      layers: [],
      reply_filter: false,
      latency_ms: 1,
    });
    renderTab();
    await screen.findByText("rival");

    await user.click(screen.getByRole("button", { name: "Test" }));
    const dialog = await screen.findByRole("dialog", { name: "Test sensitive-word rules" });
    expect(within(dialog).getByText(/against your own words only/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Text to test"), "hello");
    await user.click(within(dialog).getByRole("button", { name: "Run test" }));
    await waitFor(() => expect(mocks.test).toHaveBeenCalledWith("hello", undefined));
  });

  test("says so when the administrator has not allowed the account, instead of an editor that cannot save", async () => {
    mocks.get.mockRejectedValue(
      new ApiError({
        message: "forbidden",
        status: 403,
        payload: { error: { code: "word_policy_portal_forbidden", message: "no" } },
      }),
    );
    renderTab();

    expect(await screen.findByText("Your administrator has not opened sensitive words to you")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Add sensitive words" })).not.toBeInTheDocument();
  });

  test("any other failure can be retried", async () => {
    const user = userEvent.setup();
    mocks.get.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(ownView());
    renderTab();

    expect(await screen.findByText("network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("rival")).toBeInTheDocument();
  });
});
