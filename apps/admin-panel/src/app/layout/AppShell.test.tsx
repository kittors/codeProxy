import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@code-proxy/ui";
import { preloadPageRoute } from "@pages/registry";
import { AppShell } from "./AppShell";

vi.mock("@pages/registry", () => ({
  preloadPageRoute: vi.fn(() => Promise.resolve()),
}));

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderShell(initialPath = "/dashboard") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div>Dashboard route</div>
          <LocationEcho />
        </AppShell>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("AppShell route progress", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(preloadPageRoute).mockClear();
  });

  test("preloads the target route before navigating from the current page", async () => {
    vi.useFakeTimers();
    let resolvePreload: (() => void) | undefined;
    vi.mocked(preloadPageRoute).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolvePreload = resolve;
      }),
    );
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    const link = document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    expect(preloadPageRoute).toHaveBeenCalledWith("/ai-providers");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(680);
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    await act(async () => {
      resolvePreload?.();
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("animates a fixed window-top progress bar during sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    const link = document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]');
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    fireEvent.click(link as HTMLAnchorElement);

    const progress = document.querySelector(".rp");
    expect(progress).toBeInTheDocument();
    expect(progress).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(680);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/ai-providers");
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
  });

  test("restarts the progress animation on rapid sidebar navigation", async () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]')!);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.click(screen.getByRole("button", { name: /Models & Routing|模型与路由/i }));
    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/models"]')!);

    await act(async () => {
      vi.advanceTimersByTime(679);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).not.toHaveClass("rp-done");

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(document.querySelector(".rp")).toHaveClass("rp-done");

    act(() => {
      vi.advanceTimersByTime(360);
    });

    expect(screen.getByTestId("location")).toHaveTextContent("/models");
  });

  test("lets modified clicks keep the browser's native link behavior", () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /Access|接入管理/i }));

    fireEvent.click(document.querySelector<HTMLAnchorElement>('a[href="/ai-providers"]')!, {
      ctrlKey: true,
    });

    expect(preloadPageRoute).not.toHaveBeenCalled();
    expect(document.querySelector(".rp")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/dashboard");
  });
  test("groups sidebar routes and uses a compact neutral active state", () => {
    renderShell("/monitor/request-logs");

    const runtimeGroup = screen.getByRole("button", { name: /Operations|运行监控/i });
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "true");

    const requestLogs = screen.getByRole("link", { name: /Request Logs|请求日志/i });
    expect(requestLogs).toHaveAttribute("aria-current", "page");
    expect(requestLogs).toHaveClass("bg-slate-100", "text-[13px]", "h-9");
    expect(requestLogs.className).not.toContain("from-blue-600");

    fireEvent.click(runtimeGroup);
    expect(runtimeGroup).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /Request Logs|请求日志/i })).not.toBeInTheDocument();
  });

  test("keeps a stable icon rail and the same sidebar toggle icon when collapsed", () => {
    renderShell("/config");

    const collapseButton = screen.getByRole("button", {
      name: /Collapse Sidebar|收起侧边栏/i,
    });
    const iconClass = collapseButton.querySelector("svg")?.getAttribute("class");

    fireEvent.click(collapseButton);

    const aside = document.querySelector("aside");
    expect(aside).toHaveAttribute("data-collapsed", "true");
    expect(aside).toHaveClass("w-16");

    const expandButton = screen.getByRole("button", {
      name: /Expand Sidebar|展开侧边栏/i,
    });
    expect(expandButton.querySelector("svg")?.getAttribute("class")).toBe(iconClass);
    expect(screen.getByRole("link", { name: /Dashboard|仪表盘/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Models & Routing|模型与路由/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Admin" })).toBeInTheDocument();
  });
});
