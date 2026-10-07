import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Toaster } from "../Toaster";
import { dismissToast, getToasts, toast } from "../toastStore";

/**
 * 提示条的行为约定。外观由设计令牌决定，这里只守住会影响用户操作的部分：
 * 计时、悬停暂停、操作按钮（含「撤销后换成确认」）、队列上限和读屏角色。
 * 是否已经消失以仓库为准——退出动画结束前 DOM 节点还会短暂保留。
 */

afterEach(() => {
  act(() => dismissToast());
  vi.useRealTimers();
});

describe("Toaster", () => {
  test("显示标题，停留时长到了之后移除", () => {
    vi.useFakeTimers();
    render(<Toaster />);

    act(() => {
      toast.success("已保存", { duration: 1000 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("已保存");

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(getToasts()).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getToasts()).toHaveLength(0);
  });

  test("错误提示用 alert 角色，读屏会立即播报", () => {
    render(<Toaster />);
    act(() => {
      toast.error("刷新失败", { description: "上游返回 429" });
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("刷新失败");
    expect(alert).toHaveTextContent("上游返回 429");
  });

  test("悬停时暂停计时，移开后只计剩余时间", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast.info("可以撤销", { duration: 1000 });
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerEnter(screen.getByRole("status"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getToasts()).toHaveLength(1);

    fireEvent.pointerLeave(screen.getByRole("status"));
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(getToasts()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getToasts()).toHaveLength(0);
  });

  test("带 successLabel 的操作：点击后执行回调，并把提示换成确认文案", () => {
    const onUndo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.success("已删除 1024x1024", {
        duration: 4000,
        action: { label: "撤销", onClick: onUndo, successLabel: "已恢复 1024x1024" },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0]).toMatchObject({ type: "success", title: "已恢复 1024x1024" });
    expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已恢复 1024x1024");
  });

  test("没有 successLabel 的操作：点击后执行回调并关闭", () => {
    const onConfirm = vi.fn();
    render(<Toaster />);
    act(() => {
      toast.info("有新版本", { action: { label: "查看", onClick: onConfirm } });
    });

    fireEvent.click(screen.getByRole("button", { name: "查看" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(getToasts()).toHaveLength(0);
  });

  test("连续触发时只保留最新的三条；相同 id 替换而不是叠加", () => {
    render(<Toaster />);
    act(() => {
      for (const n of [1, 2, 3, 4]) toast.info(`第 ${n} 条`);
      toast.info("同 id 第一次", { id: "same" });
      toast.info("同 id 第二次", { id: "same" });
    });

    expect(getToasts().map((item) => item.title)).toEqual(["第 3 条", "第 4 条", "同 id 第二次"]);
  });
});
