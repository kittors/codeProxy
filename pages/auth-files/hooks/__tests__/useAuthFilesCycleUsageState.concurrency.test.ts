import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "../mapWithConcurrency";

describe("mapWithConcurrency", () => {
  it("never runs more than the concurrency limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 8 }, (_, i) => i);

    const results = await mapWithConcurrency(items, 2, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toHaveLength(8);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(
      results.map((r) => (r.status === "fulfilled" ? r.value : null)),
    ).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it("records rejections without aborting siblings", async () => {
    const worker = vi.fn(async (item: number) => {
      if (item === 1) throw new Error("boom");
      return item;
    });
    const results = await mapWithConcurrency([0, 1, 2], 2, worker);
    expect(results[0]).toEqual({ status: "fulfilled", value: 0 });
    expect(results[1].status).toBe("rejected");
    expect(results[2]).toEqual({ status: "fulfilled", value: 2 });
  });
});
