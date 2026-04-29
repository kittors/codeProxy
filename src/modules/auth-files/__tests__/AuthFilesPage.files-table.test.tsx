import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  getUsageLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 200 })),
  getAuthFileGroupTrend: vi.fn(async () => ({
    days: 7,
    group: "all",
    points: [{ date: new Date().toISOString().slice(0, 10), requests: 9 }],
  })),
  fetchQuota: vi.fn(() => new Promise(() => {})),
  deleteFile: vi.fn(async () => ({})),
  downloadText: vi.fn(async () => "{}"),
  getModelsForAuthFile: vi.fn(async () => [{ id: "live-only", owned_by: "runtime" }]),
  getModelConfigs: vi.fn(async () => [
    { id: "gpt-4.1", owned_by: "openai" },
    { id: "claude-sonnet-4-5", owned_by: "anthropic" },
  ]),
  getModelOwnerPresets: vi.fn(async () => [
    { value: "openai", label: "OpenAI", description: "OpenAI models", enabled: true },
    { value: "anthropic", label: "Anthropic", description: "Anthropic models", enabled: true },
  ]),
  upload: vi.fn(async () => ({})),
  reconcile: vi.fn(async () => ({})),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      deleteFile: mocks.deleteFile,
      downloadText: mocks.downloadText,
      getModelsForAuthFile: mocks.getModelsForAuthFile,
      upload: mocks.upload,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
    },
    quotaApi: { ...mod.quotaApi, reconcile: mocks.reconcile },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
      getUsageLogs: mocks.getUsageLogs,
      getAuthFileGroupTrend: mocks.getAuthFileGroupTrend,
    },
  };
});

vi.mock("@/modules/quota/quota-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/quota/quota-fetch")>();
  return { ...mod, fetchQuota: mocks.fetchQuota };
});

vi.mock("@/modules/ui/charts/EChart", () => ({
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

describe("AuthFilesPage files table", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.list.mockReset();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "qwen.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getEntityStats.mockReset();
    mocks.getEntityStats.mockImplementation(async () => ({ source: [], auth_index: [] }));
    mocks.getUsageLogs.mockReset();
    mocks.getUsageLogs.mockImplementation(async () => ({
      items: [],
      total: 0,
      page: 1,
      size: 200,
    }));
    mocks.getAuthFileGroupTrend.mockReset();
    mocks.getAuthFileGroupTrend.mockImplementation(async () => ({
      days: 7,
      group: "all",
      points: [{ date: new Date().toISOString().slice(0, 10), requests: 9 }],
    }));
    mocks.fetchQuota.mockReset();
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));
    mocks.deleteFile.mockReset();
    mocks.deleteFile.mockImplementation(async () => ({}));
    mocks.downloadText.mockReset();
    mocks.downloadText.mockImplementation(async () => "{}");
    mocks.getModelsForAuthFile.mockReset();
    mocks.getModelsForAuthFile.mockImplementation(async () => [
      { id: "live-only", owned_by: "runtime" },
    ]);
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockImplementation(async () => [
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "claude-sonnet-4-5", owned_by: "anthropic" },
    ]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockImplementation(async () => [
      { value: "openai", label: "OpenAI", description: "OpenAI models", enabled: true },
      { value: "anthropic", label: "Anthropic", description: "Anthropic models", enabled: true },
    ]);
    mocks.upload.mockReset();
    mocks.upload.mockImplementation(async () => ({}));
    mocks.reconcile.mockReset();
    mocks.reconcile.mockImplementation(async () => ({}));
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
    expect(screen.getByRole("button", { name: "Select current page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete All" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable/Disable" })).toBeInTheDocument();
  });

  test("supports multi-select delete from the toolbar", async () => {
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

    fireEvent.click(screen.getByLabelText("Select qwen.json"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mocks.deleteFile).toHaveBeenCalledWith("qwen.json");
      expect(screen.queryByText("qwen.json")).not.toBeInTheDocument();
    });
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
    // non-quota providers should not show Codex-specific quota labels
    expect(screen.queryByText("Code: 5h")).not.toBeInTheDocument();
  });

  test("uses channel name as display name and sorts by channel name", async () => {
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "z-last.json",
          label: "Alpha Channel",
          account_type: "oauth",
          type: "codex",
          auth_index: "2",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "codex-prod.json",
          label: "Beta Channel",
          account_type: "oauth",
          type: "codex",
          plan_type: "plus",
          auth_index: "1",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
    mocks.getEntityStats.mockImplementation(
      async () =>
        ({
          source: [],
          auth_index: [
            { entity_name: "1", requests: 9, failed: 2, avg_latency: 0, total_tokens: 0 },
            { entity_name: "2", requests: 2, failed: 0, avg_latency: 0, total_tokens: 0 },
          ],
        }) as any,
    );
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

    expect(await screen.findByText("Alpha Channel")).toBeInTheDocument();
    expect(screen.getAllByText("Beta Channel").length).toBeGreaterThan(0);
    expect(screen.queryByText("z-last.json")).not.toBeInTheDocument();
    expect(screen.queryByText("codex-prod.json")).not.toBeInTheDocument();
    expect(
      screen.getAllByText((_, node) => node?.textContent?.includes("Plan Plus") ?? false).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("9 calls")).toBeInTheDocument();

    const cards = screen.getByTestId("auth-files-cards");
    expect(cards.textContent?.indexOf("Alpha Channel")).toBeLessThan(
      cards.textContent?.indexOf("Beta Channel") ?? Number.MAX_SAFE_INTEGER,
    );
  });

  test("uses natural sorting for displayed channel names", async () => {
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "c.json",
          label: "gptplus10",
          account_type: "oauth",
          type: "codex",
          auth_index: "3",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "a.json",
          label: "gptplus1",
          account_type: "oauth",
          type: "codex",
          auth_index: "1",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "b.json",
          label: "gptplus2",
          account_type: "oauth",
          type: "codex",
          auth_index: "2",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
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

    expect(await screen.findByText("gptplus1")).toBeInTheDocument();

    const cards = screen.getByTestId("auth-files-cards");
    const text = cards.textContent ?? "";
    expect(text.indexOf("gptplus1")).toBeLessThan(text.indexOf("gptplus2"));
    expect(text.indexOf("gptplus2")).toBeLessThan(text.indexOf("gptplus10"));
  });

  test("shows custom subscription expiration status in table and cards", async () => {
    const expiresAtMs = Date.now() + 90 * 60 * 1000;
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-subscription.json",
          label: "Codex Subscriber",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          subscription_expires_at_ms: expiresAtMs,
        },
      ],
    }));

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

    expect(await screen.findByText("Codex Subscriber")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();

    cleanup();
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

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
  });

  test("saves subscription expiration from the auth fields editor", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-subscription.json",
          label: "Codex Subscriber",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.downloadText.mockImplementation(async () =>
      JSON.stringify(
        {
          type: "codex",
          subscription_expires_at: "2027-01-02T03:04:00Z",
        },
        null,
        2,
      ),
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

    expect(await screen.findByText("Codex Subscriber")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Fields" }));

    const input = await screen.findByLabelText("Subscription expires at");
    fireEvent.change(input, { target: { value: "2027-01-03T04:05" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    const uploaded = uploadCalls[0][0];
    const uploadedJson = JSON.parse(await uploaded.text()) as Record<string, unknown>;
    expect(uploadedJson.subscription_expires_at).toBe(new Date("2027-01-03T04:05").toISOString());
  });

  test("sets model owner group for the selected auth-file group from the files toolbar", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex.json",
          label: "Codex Main",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));

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

    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /codex/i }));

    const ownerSelect = await screen.findByRole("combobox", { name: "Model owner group" });
    fireEvent.click(ownerSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI" }));

    expect(ownerSelect).toHaveTextContent("OpenAI");
    expect(window.localStorage.getItem("authFilesPage.modelOwnerGroupMap.v1")).toBe(
      JSON.stringify({ codex: "openai" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog", { name: "View: codex.json" });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Models" }));

    expect(
      within(dialog).queryByRole("combobox", { name: "Model owner group" }),
    ).not.toBeInTheDocument();
    expect(await within(dialog).findByText("gpt-4.1")).toBeInTheDocument();
    expect(within(dialog).queryByText("live-only")).not.toBeInTheDocument();
    expect(mocks.getModelConfigs).toHaveBeenCalledWith("library");
    expect(mocks.getModelOwnerPresets).toHaveBeenCalledTimes(1);
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

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 34, resetAtMs: now + 120_000 },
        { label: "m_quota.review_weekly", percent: 56, resetAtMs: now + 180_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
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
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: 5h")).toBeInTheDocument();
    expect(screen.getByText("Code: Weekly")).toBeInTheDocument();
    expect(screen.getByText("Review: Weekly")).toBeInTheDocument();
    expect(await screen.findByText("12%")).toBeInTheDocument();
    expect(screen.getByText("34%")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();

    const quotaLabel = screen.getByText("Code: 5h");
    fireEvent.mouseEnter(quotaLabel);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("cards view shows only kimi coding quotas and marks depleted weekly quota red", async () => {
    const now = Date.now();
    const file = {
      name: "kimi.json",
      type: "kimi",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "9",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 100, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 0, resetAtMs: now + 120_000 },
        { label: "m_quota.review_weekly", percent: 56, resetAtMs: now + 180_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
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

    expect(await screen.findByText("kimi.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: 5h")).toBeInTheDocument();
    expect(screen.getByText("Code: Weekly")).toBeInTheDocument();
    expect(screen.queryByText("Review: Weekly")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toHaveClass("text-rose-700");
  });

  test("table preview and hover mark depleted codex quotas red", async () => {
    const now = Date.now();
    const file = {
      name: "codex-table.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "3",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 88, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 0, resetAtMs: now + 120_000 },
        { label: "m_quota.review_weekly", percent: 0, resetAtMs: now + 180_000 },
      ],
    });
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

    expect(await screen.findByText("codex-table.json")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const row = screen.getByText("codex-table.json").closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Refresh" }));

    const previewZero = await within(row as HTMLElement).findByText("0%");
    expect(previewZero).toHaveClass("text-rose-700");

    fireEvent.mouseEnter(within(row as HTMLElement).getByText("Code: Weekly"));
    const tooltip = await screen.findByRole("tooltip");
    const tooltipPercents = within(tooltip).getAllByText("0%");
    expect(tooltipPercents[0]).toHaveClass("text-rose-700");
    expect(table).toBeInTheDocument();
  });

  test("quota refresh updates the plan badge from api-call payload", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      label: "Codex Main",
      account_type: "oauth",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
      plan_type: "free",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
      planType: "plus",
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 20, resetAtMs: now + 30_000 }],
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

    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(
      (await screen.findAllByText((_, node) => node?.textContent?.includes("Plan Plus") ?? false))
        .length,
    ).toBeGreaterThan(0);
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
    mocks.fetchQuota.mockRejectedValue(new Error("request_failed"));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      "authFilesPage.dataCache.v1",
      JSON.stringify({
        savedAtMs: now,
        files: [file],
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
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );
    expect(await screen.findByText("Request failed")).toBeInTheDocument();
  });

  test("group overview summarizes current filtered results from shared quota state", async () => {
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
    mocks.getEntityStats.mockImplementationOnce(
      async () =>
        ({
          source: [],
          auth_index: [
            { entity_name: "1", requests: 9, failed: 2, avg_latency: 0, total_tokens: 0 },
          ],
        }) as any,
    );

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

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Group overview" }));

    expect(await screen.findByText("Channel Group Overview")).toBeInTheDocument();
    expect(screen.getAllByText("Current results").length).toBeGreaterThan(0);
    expect(screen.getByText("chart")).toBeInTheDocument();
  });

  test("runtime-only cards do not render a selection checkbox", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "gemini-runtime",
          label: "Gemini Runtime",
          type: "gemini-cli",
          runtime_only: true,
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
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

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select Gemini Runtime")).not.toBeInTheDocument();
  });

  test("cards view keeps selection checkbox usable after deselect", async () => {
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

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select qwen.json") as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect(screen.getByLabelText("Select qwen.json")).toBeInTheDocument();
    expect((screen.getByLabelText("Select qwen.json") as HTMLInputElement).checked).toBe(false);
  });
});
