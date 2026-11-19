import { describe, expect, test, vi } from "vitest";
import type { TFunction } from "i18next";
import type { PricingResyncJob } from "@code-proxy/api-client";
import { followPricingResync, pricingChanged } from "@pages/models/pricingResyncFeedback";
import type { ModelFormState, ModelItem } from "@pages/models/types";

/**
 * 改价后的提示要跟着后端的费用同步任务：只认这次保存排进去的任务，完成且改了费用才报条数和金额，
 * 失败报错，旧后端没有任务接口时安静结束。
 */

const form = (patch: Partial<ModelFormState> = {}): ModelFormState => ({
  originalId: "gpt-6.2-sol",
  id: "gpt-6.2-sol",
  ownedBy: "openai",
  description: "",
  enabled: true,
  mode: "token",
  inputPrice: "2",
  outputPrice: "10",
  cachedPrice: "0.1",
  pricePerCall: "",
  ...patch,
});

const model = { pricing: { mode: "token", inputPricePerMillion: 2, outputPricePerMillion: 10, cachedPricePerMillion: 0.1 } } as unknown as ModelItem;

const t = ((key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ""}`) as unknown as TFunction;

const job = (patch: Partial<PricingResyncJob>): PricingResyncJob => ({
  id: 1, mode: "fill", origin: "manual", status: "pending", modelIds: ["gpt-6.2-sol"],
  scanned: 0, changed: 0, skipped: 0, costDelta: 0, lastError: "",
  createdAt: "", updatedAt: new Date(1_000_000).toISOString(), finishedAt: "",
  ...patch,
});

function run(responses: (PricingResyncJob[] | null)[]) {
  let clock = 1_000_000;
  const notify = vi.fn();
  const fetchJobs = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]));
  const done = followPricingResync(1_000_000, notify, t, {
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    fetchJobs,
  });
  return { done, notify, fetchJobs };
}

describe("pricingChanged", () => {
  test("compares numbers, not strings", () => {
    expect(pricingChanged(form({ inputPrice: "2.0" }), model)).toBe(false);
    expect(pricingChanged(form({ inputPrice: "3" }), model)).toBe(true);
    expect(pricingChanged(form({ mode: "call", pricePerCall: "0.1" }), model)).toBe(true);
  });

  test("a new model counts as a price change when it has a price", () => {
    expect(pricingChanged(form({ inputPrice: "", outputPrice: "", cachedPrice: "" }))).toBe(false);
    expect(pricingChanged(form())).toBe(true);
  });
});

describe("followPricingResync", () => {
  test("reports the count and amount when the job of this save finishes", async () => {
    const { done, notify } = run([
      [],
      [job({ status: "running" })],
      [job({ status: "done", changed: 334, costDelta: 26.16 })],
    ]);
    await done;
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ type: "success" });
    expect(String(notify.mock.calls[0][0].message)).toContain('"count":334');
    expect(String(notify.mock.calls[0][0].message)).toContain("$26.16");
  });

  test("stays quiet when nothing needed a cost", async () => {
    const { done, notify } = run([[job({ status: "done", changed: 0 })]]);
    await done;
    expect(notify).not.toHaveBeenCalled();
  });

  test("reports a failed job", async () => {
    const { done, notify } = run([[job({ status: "failed", lastError: "database closed" })]]);
    await done;
    expect(notify.mock.calls[0][0]).toMatchObject({ type: "error" });
  });

  test("ends at once on a backend without the job endpoint", async () => {
    const { done, notify, fetchJobs } = run([null]);
    await done;
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  test("ignores jobs from before the save and automatic ones, and gives up after five minutes", async () => {
    const old = job({ status: "done", changed: 9, updatedAt: new Date(1_000_000 - 60_000).toISOString() });
    const automatic = job({ status: "done", changed: 9, origin: "auto" });
    const { done, notify, fetchJobs } = run([[old, automatic]]);
    await done;
    expect(notify).not.toHaveBeenCalled();
    expect(fetchJobs).toHaveBeenCalledTimes(30);
  });
});
