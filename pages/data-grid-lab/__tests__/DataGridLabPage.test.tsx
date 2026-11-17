import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { DataGridLabPage } from "../DataGridLabPage";
import { generateLabLogs, summarizeLabLogs } from "../labData";

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

describe("DataGridLabPage", () => {
  test("加载完成后渲染一页 50 行，状态页签切到「失败」只剩失败的请求", async () => {
    render(<DataGridLabPage />);
    const grid = screen.getByRole("grid", { name: "请求日志" });
    await waitFor(() => expect(grid.querySelectorAll("tr[data-row-key]")).toHaveLength(50), {
      timeout: 4000,
    });
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
});
