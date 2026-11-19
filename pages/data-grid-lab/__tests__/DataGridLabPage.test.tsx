import i18n from "@code-proxy/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { DataGridLabPage } from "../DataGridLabPage";
import { generateLabLogs, labThroughput, summarizeLabLogs, type LabLogRow } from "../labData";

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

const baseRow = (patch: Partial<LabLogRow>): LabLogRow => ({
  ...generateLabLogs(1, new Date(2026, 10, 17, 22, 0, 0).getTime())[0],
  ...patch,
});

describe("lab data", () => {
  test("同一个种子生成同一份数据，形状贴近线上请求日志", () => {
    const now = new Date(2026, 10, 17, 22, 0, 0).getTime();
    const first = generateLabLogs(400, now);
    const second = generateLabLogs(400, now);
    expect(second).toEqual(first);
    expect(new Set(first.map((row) => row.id)).size).toBe(400);
    // 时间倒序、都在 now 之前
    expect(
      first.every((row, index) => index === 0 || row.timestampMs <= first[index - 1].timestampMs),
    ).toBe(true);
    expect(first[0].timestampMs).toBeLessThan(now);
    // 至少有一个 OAuth 邮箱渠道（长名字检查截断与 tooltip），失败与成功都有
    expect(
      first.some((row) => row.channel.auth === "oauth" && row.channel.name.includes("@")),
    ).toBe(true);
    const summary = summarizeLabLogs(first);
    expect(summary.failed).toBeGreaterThan(0);
    expect(summary.success + summary.failed + summary.retried + summary.cancelled).toBe(400);
    // 失败请求没有输出、没有费用
    expect(
      first.filter((row) => row.status === "failed").every((row) => row.cost.total === 0),
    ).toBe(true);
  });
});

describe("labThroughput", () => {
  test("流式且有首字：输出 token ÷（总耗时 − 首字）", () => {
    const result = labThroughput(
      baseRow({ streaming: true, outputTokens: 1234, latencyMs: 35_200, firstTokenMs: 17_000 }),
    );
    expect(result?.basis).toBe("generation");
    expect(result?.ms).toBe(18_200);
    expect(result?.tokensPerSecond).toBeCloseTo(67.8, 1);
  });

  test("非流式或没有首字时间时按总耗时算", () => {
    const nonStreaming = labThroughput(
      baseRow({ streaming: false, outputTokens: 500, latencyMs: 10_000, firstTokenMs: 0 }),
    );
    expect(nonStreaming).toMatchObject({ basis: "total", ms: 10_000, tokensPerSecond: 50 });
    const noFirstToken = labThroughput(
      baseRow({ streaming: true, outputTokens: 500, latencyMs: 10_000, firstTokenMs: 0 }),
    );
    expect(noFirstToken?.basis).toBe("total");
  });

  test("首字后几乎立刻结束（缓冲写出）时按总耗时，不出现几千 tok/s 的假尖峰", () => {
    const result = labThroughput(
      baseRow({ streaming: true, outputTokens: 800, latencyMs: 4_000, firstTokenMs: 3_900 }),
    );
    expect(result).toMatchObject({ basis: "burst", ms: 4_000, tokensPerSecond: 200 });
  });

  test("没有输出或耗时为 0 时没有吞吐（显示「—」）", () => {
    expect(labThroughput(baseRow({ outputTokens: 0, latencyMs: 9_000 }))).toBeNull();
    expect(labThroughput(baseRow({ outputTokens: 300, latencyMs: 0, firstTokenMs: 0 }))).toBeNull();
  });
});

describe("DataGridLabPage", () => {
  test("请求日志：一页 50 行、没有复选框、有吞吐列；状态页签切到「失败」只剩失败的请求", async () => {
    render(<DataGridLabPage />);
    const grid = screen.getByRole("grid", { name: "请求日志" });
    await waitFor(() => expect(grid.querySelectorAll("tr[data-row-key]")).toHaveLength(50), {
      timeout: 4000,
    });
    expect(within(grid).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(grid).getByRole("columnheader", { name: /吞吐/ })).toBeInTheDocument();

    const tabs = screen.getByRole("tablist", { name: "按状态查看" });
    await userEvent.click(within(tabs).getByRole("tab", { name: /失败/ }));
    await waitFor(
      () => {
        const rows = [...grid.querySelectorAll("tr[data-row-key]")];
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.every((row) => within(row as HTMLElement).queryByRole("button", { name: /失败/ })),
        ).toBe(true);
      },
      { timeout: 4000 },
    );
    expect(screen.getByRole("list", { name: /筛选|filters/i })).toHaveTextContent("状态");
  });

  test("多选在 API Key 示例里：全选本页、提示选中全部、批量停用改动数据", async () => {
    const user = userEvent.setup();
    render(<DataGridLabPage />);
    await user.click(screen.getByRole("radio", { name: "API Key（多选）" }));
    const grid = await screen.findByRole("grid", { name: "API Key" });
    await user.click(within(grid).getByRole("checkbox", { name: tr("data_grid.select_page") }));
    const bar = document.querySelector<HTMLElement>("[data-grid-selection-bar]");
    expect(bar).not.toBeNull();
    expect(
      within(bar as HTMLElement).getByText(tr("data_grid.selected_rows", { count: 10 })),
    ).toBeInTheDocument();
    await user.click(within(bar as HTMLElement).getByRole("button", { name: "选中全部 26 个" }));
    expect(
      within(bar as HTMLElement).getByText(tr("data_grid.selected_rows", { count: 26 })),
    ).toBeInTheDocument();
    await user.click(within(bar as HTMLElement).getByRole("button", { name: /停用/ }));
    await waitFor(() => expect(within(grid).getAllByText("已停用")).toHaveLength(10));
  });
});
