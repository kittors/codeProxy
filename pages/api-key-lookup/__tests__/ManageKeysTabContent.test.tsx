import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { emptyQuotaMatrix, normalizeEndUser, normalizeEndUserAPIKey } from "@code-proxy/api-client";
import { ManageKeysTabContent } from "../components/ManageKeysTabContent";

const mocks = vi.hoisted(() => ({ attempts: vi.fn() }));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, portalApi: { ...actual.portalApi, attempts: mocks.attempts } };
});

const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options));

describe("ManageKeysTabContent", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.attempts.mockResolvedValue({ items: [] });
  });

  test("the signed-in account and each of its keys show what their requests in flight hold", async () => {
    const limits = emptyQuotaMatrix();
    limits.cost.day = 20;
    const used = emptyQuotaMatrix();
    used.cost.day = 5;
    const usage = { total: used, rules: [], "in-flight": { requests: 1, tokens: 0, cost: 2 } };
    const account = normalizeEndUser({
      id: "user-1",
      tenant_id: "t1",
      username: "alice",
      status: "active",
      must_change_password: false,
      created_at: "",
      updated_at: "",
      version: 1,
      "quota-limits": limits,
      "quota-usage": usage,
    });
    const key = normalizeEndUserAPIKey({
      id: "k1",
      tenant_id: "t1",
      end_user_id: "user-1",
      name: "primary",
      key_masked: "sk-****1111",
      disabled: false,
      is_default: true,
      "quota-limits": limits,
      "model-rules": [],
      "quota-usage": usage,
    });
    render(
      <ThemeProvider>
        <ToastProvider>
          <ManageKeysTabContent
            t={t}
            keys={[key]}
            account={account}
            accessPolicy
            onRefresh={vi.fn()}
            onCreate={vi.fn()}
            onRotate={vi.fn()}
            onDelete={vi.fn()}
            onEdit={vi.fn()}
            onResetPeriodSpending={vi.fn()}
          />
        </ToastProvider>
      </ThemeProvider>,
    );
    // 顶部账号额度一格、Key 表格一格。
    expect(
      await screen.findAllByTitle(
        "Spend · Daily: $5 used of $20, plus $2 reserved by requests in flight",
      ),
    ).toHaveLength(2);
  });
});
