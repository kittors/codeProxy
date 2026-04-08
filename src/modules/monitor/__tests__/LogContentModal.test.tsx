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

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return { id: 1, model: "gpt-test", part, content: JSON.stringify(inputPayload) };
      }
      return {
        id: 1,
        model: "gpt-test",
        part,
        content: '{"choices":[{"message":{"content":"ok"}}]}',
      };
    });

    render(
      <ThemeProvider>
        <LogContentModal
          open
          logId={1}
          initialTab="input"
          onClose={() => {}}
          fetchPartFn={fetchPartFn}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchPartFn).toHaveBeenCalled();
    expect(fetchPartFn.mock.calls[0]?.[1]).toBe("input");

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

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return { id: 1, model: "gpt-test", part, content: '{"a":1,"b":{"c":2}}' };
      }
      return { id: 1, model: "gpt-test", part, content: "" };
    });

    render(
      <ThemeProvider>
        <LogContentModal
          open
          logId={1}
          initialTab="input"
          onClose={() => {}}
          fetchPartFn={fetchPartFn}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchPartFn).toHaveBeenCalled();

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
