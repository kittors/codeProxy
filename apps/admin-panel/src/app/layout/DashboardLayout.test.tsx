import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { pendingPageLoad, preloadablePage } from "@pages/preloadablePage";
import { DashboardLayout } from "./DashboardLayout";

const gate = vi.hoisted(() => ({
  pending: (_pathname: string): Promise<void> | null => null,
  fallbackCommits: 0,
}));

vi.mock("@pages/registry", () => ({
  pendingPageCode: (pathname: string) => gate.pending(pathname),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => null,
}));

vi.mock("./AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="shell">{children}</div>,
}));

function RouteFallback() {
  useEffect(() => {
    gate.fallbackCommits += 1;
  }, []);
  return <div data-testid="route-fallback" />;
}

describe("DashboardLayout", () => {
  test("keeps the current page and the shell on screen while the next page's code loads", async () => {
    let finishLoad!: (module: { default: ComponentType }) => void;
    const { Page: SlowPage, preload } = preloadablePage(
      () => new Promise((resolve) => (finishLoad = resolve)),
    );
    gate.pending = (pathname) => (pathname === "/slow" ? pendingPageLoad(preload) : null);
    gate.fallbackCommits = 0;

    render(
      <MemoryRouter initialEntries={["/home"]}>
        {/* 和 AppRouter 一样：页面代码的 Suspense 边界在外壳之外，回退是空的。 */}
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route
                path="/home"
                element={
                  <div>
                    home page <Link to="/slow">open slow page</Link>
                  </div>
                }
              />
              <Route path="/slow" element={<SlowPage />} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole("link", { name: "open slow page" }));
    // 给退场动画和随后的挂载留出时间
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // 代码没到：旧页面和外壳都还在，没有掉进空回退
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(screen.getByText(/home page/)).toBeInTheDocument();
    expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
    expect(gate.fallbackCommits).toBe(0);

    await act(async () => {
      finishLoad({ default: () => <div>slow page</div> });
    });

    expect(await screen.findByText("slow page")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/home page/)).not.toBeInTheDocument());
    expect(screen.getByTestId("shell")).toBeInTheDocument();
    expect(gate.fallbackCommits).toBe(0);
  });
});
