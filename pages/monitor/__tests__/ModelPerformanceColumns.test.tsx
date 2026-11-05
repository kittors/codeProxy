import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { normalizeMonitorOverview } from "@code-proxy/api-client";
import { ModelLeaderboardCard } from "../components/RankingCards";

// The model ranking reads its first-token and generation-speed columns from the
// per-request percentiles first, falls back to the rollup means, and shows a dash
// rather than 0 when nothing measured them.

function renderCard(raw: unknown) {
  return render(
    <ModelLeaderboardCard
      overview={normalizeMonitorOverview(raw)}
      legacy={false}
      loading={false}
      isDark={false}
      selected={[]}
      onSelect={vi.fn()}
    />,
  );
}

const rowOf = (model: string) => {
  const row = screen.getByText(model).closest("tr");
  if (!row) throw new Error(`no row for ${model}`);
  return within(row);
};

const quiet = (samples = 0) => ({ samples, p50: 0, p90: 0 });

const overviewWith = (rows: unknown[], coverage = "") => ({
  range: { key: "7d", start: "2026-10-28T00:00:00+08:00", end: "2026-11-05T00:00:00+08:00" },
  summary: { current: { requests: 300 } },
  models: { rows, total: rows.length, performance_coverage_start: coverage },
});

describe("model ranking performance columns", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("shows the per-request P50 with the P90 below it", () => {
    renderCard(
      overviewWith([
        {
          key: "gemini-3.8-flash-high",
          label: "gemini-3.8-flash-high",
          requests: 100,
          first_token_avg_ms: 12892,
          generation_samples: 981,
          generation_tokens_per_second: 152.4,
          performance: {
            generation_speed: { samples: 981, p50: 146.3, p90: 207.3 },
            first_token_ms: { samples: 900, p50: 8400, p90: 25000 },
            first_token_ms_per_1k_input: 112.04,
          },
        },
      ]),
    );
    const row = rowOf("gemini-3.8-flash-high");
    const speed = row.getByText("146 tok/s").parentElement;
    expect(speed).toHaveTextContent("P90 207 tok/s");
    expect(speed).toHaveAttribute(
      "title",
      "P50 146 tok/s · P90 207 tok/s · 981 个请求 · 平均 152 tok/s",
    );
    const firstToken = row.getByText("8.40s").parentElement;
    expect(firstToken).toHaveTextContent("P90 25.0s");
    expect(firstToken?.getAttribute("title")).toContain("P50 8.40s · P90 25.0s");
    expect(row.getByText("112ms")).toBeInTheDocument();
  });

  test("falls back to the rollup averages once the details have expired", () => {
    renderCard(
      overviewWith([
        {
          key: "expired-model",
          label: "expired-model",
          requests: 80,
          first_token_avg_ms: 2500,
          generation_samples: 40,
          generation_tokens_per_second: 61.6,
          performance: {
            generation_speed: quiet(),
            first_token_ms: quiet(),
            first_token_ms_per_1k_input: null,
          },
        },
      ]),
    );
    const row = rowOf("expired-model");
    const speed = row.getByText("62 tok/s").parentElement;
    expect(speed).toHaveTextContent("均值");
    expect(speed).toHaveAttribute("title", "这段时间的请求明细已过期，显示的是平均值");
    expect(row.getByText("2.50s").parentElement).toHaveTextContent("均值");
  });

  test("shows a dash, not 0, when no request measured the speed", () => {
    renderCard(
      overviewWith([
        {
          key: "batch-model",
          label: "batch-model",
          requests: 70,
          generation_samples: 0,
          generation_tokens_per_second: null,
          output_tokens_per_second: 0,
          performance: {
            generation_speed: quiet(),
            first_token_ms: quiet(),
            first_token_ms_per_1k_input: null,
          },
        },
      ]),
    );
    const row = rowOf("batch-model");
    // No "0 tok/s": a dash says nothing was measured.
    expect(row.queryByText(/tok\/s/)).toBeNull();
    const dashes = row.getAllByText("—");
    expect(dashes.map((cell) => cell.getAttribute("title"))).toEqual(
      expect.arrayContaining([
        "这段时间没有记录首字时间的流式请求",
        "这段时间没有可算生成速度的请求：需要成功的流式请求，出字耗时 ≥ 0.5 秒且输出 ≥ 50 token",
      ]),
    );
  });

  test("ignores an older backend's speed, which counted the first-token wait", async () => {
    await i18n.changeLanguage("en");
    renderCard(
      overviewWith([
        {
          key: "older",
          label: "older",
          requests: 50,
          first_token_avg_ms: 3000,
          output_tokens_per_second: 17.5,
        },
      ]),
    );
    const row = rowOf("older");
    expect(row.queryByText(/tok\/s/)).toBeNull();
    const titles = row.getAllByText("—").map((cell) => cell.getAttribute("title"));
    expect(titles).toContain(
      "Upgrade CliRelay to see it: older versions counted the wait for the first token as generation time",
    );
    // The first-token average of an older backend is still worth showing.
    expect(row.getByText("3.00s").parentElement).toHaveTextContent("avg");
  });

  test("explains each measurement on its header", () => {
    renderCard(overviewWith([{ key: "m", label: "m", requests: 1 }]));
    const hint = screen.getByRole("img", { name: /输出 token ÷ 出字耗时（不含首字时间）/ });
    fireEvent.focusIn(hint);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "只统计成功的流式请求，出字耗时 ≥ 0.5 秒且输出 ≥ 50 token；推理 token 不计入",
    );
    expect(
      screen.getByRole("img", { name: /从收到请求到写出第一个数据块的时间/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /首字时间合计 ÷ 输入 token 合计 × 1000/ }),
    ).toBeInTheDocument();
  });

  test("says where the percentiles start when older details have expired", () => {
    const { unmount } = renderCard(
      overviewWith([{ key: "m", label: "m", requests: 1 }], "2026-10-30T14:56:28+08:00"),
    );
    expect(screen.getByText(/分位数基于 10\/30 14:56 之后的请求明细/)).toBeInTheDocument();
    unmount();
    // Details that reach back to the range start need no note.
    renderCard(overviewWith([{ key: "m", label: "m", requests: 1 }], "2026-10-28T00:10:00+08:00"));
    expect(screen.queryByText(/分位数基于/)).toBeNull();
  });
});
