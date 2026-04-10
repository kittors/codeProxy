import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({
    files: [
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: Date.now(),
        disabled: false,
      },
    ],
  })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  fetchQuota: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, list: mocks.list },
    usageApi: { ...mod.usageApi, getEntityStats: mocks.getEntityStats },
  };
});

vi.mock("@/modules/quota/quota-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/quota/quota-fetch")>();
  return { ...mod, fetchQuota: mocks.fetchQuota };
});

describe("AuthFilesPage files table", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("renders VirtualTable for auth files and keeps actions available", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Quota")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Quota" })).toBeInTheDocument();
    expect(screen.getByText("5h")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add OAuth Login" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable/Disable" })).toBeInTheDocument();
  });

  test("shows a skeleton table while first loading", async () => {
    mocks.list.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-table-skeleton")).toBeInTheDocument();
  });

  test("restores last data on route switch and refreshes quietly", async () => {
    const wrap = (node: ReactNode) => (
      <ThemeProvider>
        <ToastProvider>{node}</ToastProvider>
      </ThemeProvider>
    );

    const router = createMemoryRouter(
      [
        { path: "/auth-files", element: wrap(<AuthFilesPage />) },
        { path: "/api-keys", element: wrap(<div>api keys</div>) },
      ],
      { initialEntries: ["/auth-files"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("/api-keys");
    });
    expect(screen.getByText("api keys")).toBeInTheDocument();

    mocks.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => {
            resolve({
              files: [
                {
                  name: "qwen.json",
                  type: "qwen",
                  size: 1024,
                  modified: Date.now(),
                  disabled: false,
                },
              ],
            });
          }, 200);
        }),
    );

    await act(async () => {
      await router.navigate("/auth-files");
    });

    // Should render immediately from sessionStorage cache (no blank state)
    expect(screen.getByText("qwen.json")).toBeInTheDocument();
  });

  test("reads quota preview setting from localStorage", async () => {
    window.localStorage.setItem("authFilesPage.quotaPreview.v1", JSON.stringify("week"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Quota" })).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
  });

  test("reads files view mode from localStorage", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("cards view shows codex quota bars by stable label keys (no quota tooltip)", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: null,
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [
              { label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 34, resetAtMs: now + 120_000 },
              { label: "m_quota.review_weekly", percent: 56, resetAtMs: now + 180_000 },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();

    expect(screen.getByText("Code: 5h")).toBeInTheDocument();
    expect(screen.getByText("Code: Weekly")).toBeInTheDocument();
    expect(screen.getByText("Review: Weekly")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("34%")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();

    const quotaLabel = screen.getByText("Code: 5h");
    fireEvent.mouseEnter(quotaLabel);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("cards view shows inline error when quota fetch fails", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: null,
        quotaByFileName: {
          "codex.json": {
            status: "error",
            updatedAt: now,
            items: [],
            error: "request_failed",
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.getByText("Request failed")).toBeInTheDocument();
  });
});
