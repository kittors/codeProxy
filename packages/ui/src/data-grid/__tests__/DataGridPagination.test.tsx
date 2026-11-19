import i18n from "@code-proxy/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DataGridPagination } from "../DataGridPagination";

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

describe("DataGridPagination", () => {
  test("显示条数区间、标出当前页，首页时上一页不可用", () => {
    render(
      <DataGridPagination page={1} pageSize={50} total={1354} onPageChange={() => undefined} />,
    );
    expect(
      screen.getByRole("navigation", { name: tr("data_grid.pagination") }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tr("data_grid.page_range", { start: "1", end: "50", total: "1,354" })),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: tr("data_grid.page_n", { page: 1 }) }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: tr("data_grid.prev_page") })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: tr("data_grid.page_n", { page: 28 }) }),
    ).toBeInTheDocument();
  });

  test("翻页按钮与页码都回调目标页，跳页输入按回车生效并夹到范围内", async () => {
    const onPageChange = vi.fn();
    render(<DataGridPagination page={3} pageSize={50} total={1354} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: tr("data_grid.next_page") }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
    await userEvent.click(screen.getByRole("button", { name: tr("data_grid.last_page") }));
    expect(onPageChange).toHaveBeenLastCalledWith(28);

    const jump = screen.getByRole("textbox", { name: tr("data_grid.go_to_page") });
    await userEvent.type(jump, "99");
    fireEvent.keyDown(jump, { key: "Enter" });
    expect(onPageChange).toHaveBeenLastCalledWith(28);
    expect(jump).toHaveValue("");
  });

  test("没有数据时不写「第 0–0 条」，总数未到时只显示占位", () => {
    const { rerender } = render(
      <DataGridPagination page={1} pageSize={50} total={0} onPageChange={() => undefined} />,
    );
    expect(screen.getByText(tr("data_grid.page_empty"))).toBeInTheDocument();
    rerender(
      <DataGridPagination
        page={1}
        pageSize={50}
        total={0}
        pending
        onPageChange={() => undefined}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
