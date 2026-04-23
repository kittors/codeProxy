import { act, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

const root = resolve(__dirname, "../../..");
const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("LogContentModal", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.useRealTimers();
  });

  test("uses fixed viewport-safe dimensions while preserving enter and exit animation", () => {
    const renderingSource = readModule(
      "modules/monitor/log-content/rendering.tsx",
    );
    const modalSource = readModule("modules/monitor/LogContentModal.tsx");

    expect(renderingSource).toContain("AnimatePresence");
    expect(renderingSource).toContain('exit="hidden"');
    expect(renderingSource).toContain("w-[min(calc(100vw-2rem),1040px)]");
    expect(renderingSource).toContain("h-[min(82dvh,760px)]");
    expect(modalSource).toContain("LOADING_EXIT_MS");
    expect(modalSource).toContain("CONTENT_ENTER_MS");
    expect(modalSource).toContain('contentPhase === "loading" ? 1 : 0');
    expect(modalSource).toContain('filter: "blur(3px)"');
    expect(modalSource).not.toContain("y: 10");
    expect(modalSource).toContain("relative min-h-0 flex-1");
    expect(modalSource).toContain(
      "absolute inset-0 overflow-y-auto overscroll-contain",
    );
    expect(modalSource).toContain("min-h-0 flex-1 items-center justify-center");
    expect(modalSource).toContain("exit={{ opacity: 0");
  });

  test("protects large request detail content from fast-scroll blanking", () => {
    const renderingSource = readModule(
      "modules/monitor/log-content/rendering.tsx",
    );

    expect(renderingSource).toContain("VIRTUAL_MESSAGE_CONTENT_THRESHOLD");
    expect(renderingSource).toContain("shouldVirtualizeMessages");
    expect(renderingSource).toContain("VIRTUAL_MESSAGE_OVERSCAN");
    expect(renderingSource).not.toContain("contentVisibility");
    expect(renderingSource).not.toContain("containIntrinsicSize");
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
        return {
          id: 1,
          model: "gpt-test",
          part,
          content: JSON.stringify(inputPayload),
        };
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

    expect(fetchPartFn).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchPartFn).toHaveBeenCalled();
    expect(fetchPartFn).toHaveBeenCalledTimes(1);
    expect(fetchPartFn.mock.calls[0]?.[1]).toBe("input");

    // Before idle parsing runs: avoid mounting the full raw payload in the opening frame.
    expect(document.body.textContent).not.toContain('"messages"');
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

  test("keeps the original payload in Raw view instead of pretty-printing it", async () => {
    vi.useFakeTimers();

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return {
          id: 1,
          model: "gpt-test",
          part,
          content: '{"a":1,"b":{"c":2}}',
        };
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

    expect(fetchPartFn).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });
    await act(async () => {});
    expect(getPre()).not.toBeNull();

    expect(getPre()!.textContent).toBe('{"a":1,"b":{"c":2}}');
  });

  test("renders gpt-image-2 input as structured fields and keeps Raw as the original source", async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("zh-CN");

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return {
          id: 1,
          model: "gpt-image-2",
          part,
          content:
            '{"model":"gpt-image-2","prompt":"画一只狐狸","size":"1024x1536"}',
        };
      }
      return {
        id: 1,
        model: "gpt-image-2",
        part,
        content: '{"created":1776910933,"data":[{"b64_json":"aGVsbG8="}]}',
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
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {});
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const structuredCard = screen.getByTestId("image-request-structured-card");
    expect(structuredCard).toBeInTheDocument();
    expect(within(structuredCard).getByText("模型")).toBeInTheDocument();
    expect(within(structuredCard).getByText("gpt-image-2")).toBeInTheDocument();
    expect(within(structuredCard).getByText("提示词")).toBeInTheDocument();
    expect(within(structuredCard).getByText("画一只狐狸")).toBeInTheDocument();
    expect(within(structuredCard).getByText("size")).toBeInTheDocument();
    expect(within(structuredCard).getByText("1024x1536")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{"model":"gpt-image-2"');

    await act(async () => {
      screen.getByTitle("原始数据").click();
    });
    expect(
      Array.from(document.body.querySelectorAll("pre")).map(
        (pre) => pre.textContent,
      ),
    ).toContain(
      '{"model":"gpt-image-2","prompt":"画一只狐狸","size":"1024x1536"}',
    );
  });

  test("renders gpt-image-2 output as an image-only rendered view with reusable preview controls", async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("zh-CN");

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return {
          id: 1,
          model: "gpt-image-2",
          part,
          content: '{"model":"gpt-image-2","prompt":"画一只狐狸"}',
        };
      }
      return {
        id: 1,
        model: "gpt-image-2",
        part,
        content:
          '{"created":1776910933,"data":[{"b64_json":"aGVsbG8="},{"b64_json":"d29ybGQ="}]}',
      };
    });

    render(
      <ThemeProvider>
        <LogContentModal
          open
          logId={1}
          initialTab="output"
          onClose={() => {}}
          fetchPartFn={fetchPartFn}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {});
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(document.body.textContent).not.toContain('"b64_json"');
    expect(document.body.textContent).not.toContain('"created":1776910933');
    const images = screen.getAllByRole("img", { name: "输出" });
    expect(images).toHaveLength(2);
    const image = images[0]!;
    expect(image).toHaveAttribute("src", "data:image/png;base64,aGVsbG8=");
    expect(screen.getAllByRole("button", { name: "点击预览" })).toHaveLength(2);

    await act(async () => {
      images[1]!.click();
    });

    const preview = screen.getByRole("dialog", { name: /输出 · gpt-image-2/ });
    expect(preview).toHaveAttribute("data-variant", "image-only");
    expect(screen.getByRole("button", { name: "放大" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "向左旋转" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载" })).toHaveAttribute(
      "download",
      "gpt-image-2-output-2.png",
    );

    const previewImage = within(preview).getByRole("img", { name: "输出" });
    expect(previewImage).toHaveAttribute(
      "src",
      "data:image/png;base64,d29ybGQ=",
    );
    const rotateRight = screen.getByRole("button", { name: "向右旋转" });
    await act(async () => {
      rotateRight.click();
    });
    expect(previewImage.getAttribute("style")).toContain("rotate(90deg)");
    await act(async () => {
      rotateRight.click();
    });
    expect(previewImage.getAttribute("style")).toContain("rotate(180deg)");
    await act(async () => {
      rotateRight.click();
    });
    expect(previewImage.getAttribute("style")).toContain("rotate(270deg)");

    await act(async () => {
      screen.getByTitle("原始数据").click();
    });
    expect(document.body.querySelector("pre")!.textContent).toBe(
      '{"created":1776910933,"data":[{"b64_json":"aGVsbG8="},{"b64_json":"d29ybGQ="}]}',
    );
  });

  test("does not mount massive raw content while rendered view parsing is deferred", async () => {
    vi.useFakeTimers();

    const tailMarker = "large-tail-marker";
    const inputPayload = {
      messages: [
        {
          role: "user",
          content: `${"large line ".repeat(20_000)}${tailMarker}`,
        },
      ],
    };

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return {
          id: 1,
          model: "gpt-test",
          part,
          content: JSON.stringify(inputPayload),
        };
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

    expect(fetchPartFn).not.toHaveBeenCalled();
    expect(document.body.querySelector("pre")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchPartFn).toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(tailMarker);
    expect(document.body.querySelector("pre")).toBeNull();
  });

  test("does not refetch endlessly when a prefetched tab resolves to empty content", async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage("zh-CN");

    const fetchPartFn = vi.fn(async (_id: number, part: "input" | "output") => {
      if (part === "input") {
        return {
          id: 1,
          model: "gpt-image-2",
          part,
          content: '{"model":"gpt-image-2","prompt":"画一只狐狸"}',
        };
      }
      return {
        id: 1,
        model: "gpt-image-2",
        part,
        content: "",
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
      await vi.advanceTimersByTimeAsync(260);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchPartFn).toHaveBeenCalledTimes(2);

    await act(async () => {
      screen.getByRole("tab", { name: "输出" }).click();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchPartFn).toHaveBeenCalledTimes(2);
    expect(screen.getByText("暂无输出记录")).toBeInTheDocument();
  });
});
