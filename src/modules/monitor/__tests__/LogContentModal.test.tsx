import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

describe("LogContentModal", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.useRealTimers();
  });

  test("renders a fast full preview first, then progressively mounts parsed messages", async () => {
    vi.useFakeTimers();

    const inputPayload = {
      messages: Array.from({ length: 30 }).map((_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `hello-${i}`,
      })),
    };

    const fetchFn = vi.fn().mockResolvedValue({
      input_content: JSON.stringify(inputPayload),
      output_content: '{"choices":[{"message":{"content":"ok"}}]}',
      model: "gpt-test",
    });

    render(
      <ThemeProvider>
        <LogContentModal open logId={1} initialTab="input" onClose={() => {}} fetchFn={fetchFn} />
      </ThemeProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalled();

    // Before idle parsing runs: show a full raw preview (no freeze, full content available).
    expect(screen.getByText(/"messages"/)).toBeInTheDocument();
    expect(screen.queryByText("hello-29")).not.toBeInTheDocument();

    // After idle tasks: parsing + progressive reveal completes.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // Flush effects triggered by the parsing state update (they schedule the reveal timers).
    await act(async () => {});
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText("hello-0")).toBeInTheDocument();
    expect(screen.getByText("hello-29")).toBeInTheDocument();
  });

  test("pretty-prints JSON in Raw view asynchronously", async () => {
    vi.useFakeTimers();

    const fetchFn = vi.fn().mockResolvedValue({
      input_content: '{"a":1,"b":{"c":2}}',
      output_content: "",
      model: "gpt-test",
    });

    render(
      <ThemeProvider>
        <LogContentModal open logId={1} initialTab="input" onClose={() => {}} fetchFn={fetchFn} />
      </ThemeProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchFn).toHaveBeenCalled();

    // Switch to Raw mode.
    await act(async () => {
      screen.getByTitle("原始数据").click();
    });

    const getPre = () => document.body.querySelector("pre");
    expect(getPre()).not.toBeNull();
    expect(getPre()!.textContent).toContain('{"a":1');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getPre()!.textContent).toContain('\n  "a": 1');
    expect(getPre()!.textContent).toContain('\n    "c": 2');
  });
});
