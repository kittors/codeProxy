import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { useAuthFilesStatusState } from "../useAuthFilesStatusState";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    aiAccountsStatusApi: { ...mod.aiAccountsStatusApi, getStatus: mocks.getStatus },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/ui")>();
  return { ...mod, useToast: () => ({ notify: mocks.notify }) };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderSlots = () =>
  renderHook(() =>
    useAuthFilesStatusState({
      tab: "files",
      pageItems: [],
      loading: false,
      setFiles: vi.fn(),
      setDetailFile: vi.fn(),
    }),
  );

const item = (key: string, label: string, percent: number): QuotaItem => ({
  key,
  label,
  percent,
});

describe("resolveQuotaCardSlots", () => {
  beforeEach(() => {
    mocks.getStatus.mockReset();
    mocks.notify.mockReset();
    mocks.getStatus.mockResolvedValue({ items: [] });
  });

  // The fuzzy fallbacks overlap: /weekly|week|周/ backs code_week but also matches
  // a review_week entry. Without claiming, a codex account that reported only its
  // review windows rendered that one window twice under two different labels.
  test("never assigns one quota item to two slots", () => {
    const { result } = renderSlots();

    const slots = result.current.resolveQuotaCardSlots("codex", [
      item("review_week", "m_quota.review_weekly", 88),
      item("review_5h", "m_quota.review_5h", 44),
    ]);

    const items = slots.map((slot) => slot.item);
    expect(new Set(items).size).toBe(items.length);
    expect(slots.filter((slot) => slot.id === "code_week")).toHaveLength(0);
    expect(slots.map((slot) => slot.id).sort()).toEqual(["review_5h", "review_week"]);
  });

  test("still fills coding slots from exact keys", () => {
    const { result } = renderSlots();

    const slots = result.current.resolveQuotaCardSlots("codex", [
      item("code_5h", "m_quota.code_5h", 40),
      item("code_week", "m_quota.code_weekly", 15),
      item("additional:codex_bengalfox:week", "GPT-5.3-Codex-Spark: Weekly", 96),
    ]);

    expect(slots.map((slot) => slot.id)).toEqual([
      "code_5h",
      "code_week",
      "additional:codex_bengalfox:week",
    ]);
    expect(new Set(slots.map((slot) => slot.item)).size).toBe(3);
  });

  // Exact keys must win over another slot's fuzzy branch regardless of input order.
  test("exact key matches are not stolen by a fuzzy fallback", () => {
    const { result } = renderSlots();

    const slots = result.current.resolveQuotaCardSlots("codex", [
      item("review_week", "m_quota.review_weekly", 88),
      item("code_week", "m_quota.code_weekly", 15),
    ]);

    const codeWeek = slots.find((slot) => slot.id === "code_week");
    const reviewWeek = slots.find((slot) => slot.id === "review_week");
    expect(codeWeek?.item?.key).toBe("code_week");
    expect(reviewWeek?.item?.key).toBe("review_week");
  });
});
