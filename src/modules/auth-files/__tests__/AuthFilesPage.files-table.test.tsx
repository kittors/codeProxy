import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";
import {
  AUTH_FILES_DATA_CACHE_KEY,
  AUTH_FILES_UI_STATE_KEY,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import i18n from "@/i18n";

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
  fetchQuota: vi.fn((_provider?: unknown, _file?: { name?: string }) => new Promise(() => {})),
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

const padDatePart = (value: number): string => String(value).padStart(2, "0");

const toDateTimeLocalInput = (date: Date): string =>
  [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");

describe("AuthFilesPage files table", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
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
    vi.restoreAllMocks();
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

  test("shows derived subscription days remaining in table and cards", async () => {
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const startedAt = new Date(expiresAt);
    startedAt.setFullYear(startedAt.getFullYear() - 1);
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
          subscription_started_at: startedAt.toISOString(),
          subscription_period: "yearly",
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
    expect(screen.getByText(/5d left/)).toBeInTheDocument();

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
    expect(screen.getByText(/5d left/)).toBeInTheDocument();
  });

  test("saves subscription start and period from the auth fields editor", async () => {
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
          subscription_started_at: "2027-01-02T03:04:00Z",
          subscription_period: "monthly",
          subscription_expires_at: "2099-01-01T00:00:00Z",
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

    const input = await screen.findByLabelText("Subscription start date");
    fireEvent.change(input, { target: { value: "2027-01-03T04:05" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Subscription cycle" }));
    fireEvent.click(await screen.findByRole("option", { name: "Yearly" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    const uploaded = uploadCalls[0][0];
    const uploadedJson = JSON.parse(await uploaded.text()) as Record<string, unknown>;
    expect(uploadedJson.subscription_started_at).toBe(new Date("2027-01-03T04:05").toISOString());
    expect(uploadedJson.subscription_period).toBe("yearly");
    expect(uploadedJson.subscription_expires_at).toBeUndefined();
  });

  test("uses the subscription date picker from the auth fields editor", async () => {
    const initialStartedAt = "2027-01-02T03:04:00Z";
    const expectedStartedAt = new Date(initialStartedAt);
    expectedStartedAt.setFullYear(2027, 0, 15);
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
          subscription_started_at: initialStartedAt,
          subscription_period: "monthly",
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

    fireEvent.click(await screen.findByLabelText("Subscription start date"));
    expect(screen.getByRole("dialog", { name: "Date picker" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "15" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    const uploaded = uploadCalls[0][0];
    const uploadedJson = JSON.parse(await uploaded.text()) as Record<string, unknown>;
    expect(uploadedJson.subscription_started_at).toBe(expectedStartedAt.toISOString());
  });

  test("closes the fields modal and refreshes the card subscription badge after saving", async () => {
    const startedAt = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000);
    startedAt.setSeconds(0, 0);
    const startedAtInput = toDateTimeLocalInput(startedAt);
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
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
    mocks.downloadText.mockImplementation(async () => JSON.stringify({ type: "codex" }, null, 2));

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

    const cards = await screen.findByTestId("auth-files-cards");
    expect(cards).not.toHaveTextContent(/d left/);
    fireEvent.click(within(cards).getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog", { name: "View: codex-subscription.json" });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Fields" }));

    const input = await within(dialog).findByLabelText("Subscription start date");
    fireEvent.change(input, { target: { value: startedAtInput } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    const uploadedJson = JSON.parse(await uploadCalls[0][0].text()) as Record<string, unknown>;
    expect(uploadedJson.subscription_started_at).toBe(new Date(startedAtInput).toISOString());
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "View: codex-subscription.json" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByTestId("auth-files-cards")).toHaveTextContent(/d left/));
  });

  test("sets model owner group from an icon modal after confirmation", async () => {
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

    expect(
      screen.queryByText("No owner group selected; each auth file uses live model query."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model owner group" })).not.toBeInTheDocument();

    const settingsButton = screen.getByRole("button", { name: "Model owner group" });
    fireEvent.mouseEnter(settingsButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Model owner group");
    fireEvent.mouseLeave(settingsButton);

    fireEvent.click(settingsButton);
    const settingsDialog = await screen.findByRole("dialog", { name: "Model owner group" });
    const ownerSelect = within(settingsDialog).getByRole("combobox", {
      name: "Model owner group",
    });
    fireEvent.click(ownerSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI" }));

    expect(ownerSelect).toHaveTextContent("OpenAI");
    expect(await within(settingsDialog).findByText("gpt-4.1")).toBeInTheDocument();
    expect(within(settingsDialog).queryByText("claude-sonnet-4-5")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("authFilesPage.modelOwnerGroupMap.v1")).toBeNull();

    fireEvent.click(within(settingsDialog).getByRole("button", { name: "Save" }));
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
      AUTH_FILES_DATA_CACHE_KEY,
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

  test("cards view shows all antigravity quota items instead of truncating to three", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              { key: "model:a", label: "Model A [a]", percent: 91 },
              { key: "model:b", label: "Model B [b]", percent: 82 },
              { key: "model:c", label: "Model C [c]", percent: 73 },
              { key: "model:d", label: "Model D [d]", percent: 64 },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(within(cards).getByText("Model A [a]")).toBeInTheDocument();
    expect(within(cards).getByText("Model B [b]")).toBeInTheDocument();
    expect(within(cards).getByText("Model C [c]")).toBeInTheDocument();
    expect(within(cards).getByText("Model D [d]")).toBeInTheDocument();
  });

  test("cards view hides cached antigravity models skipped by the reference implementation", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
              },
              { key: "model:chat_20706", label: "chat_20706", percent: 100 },
              { key: "model:chat_23310", label: "chat_23310", percent: 100 },
              {
                key: "model:tab_flash_lite_preview",
                label: "tab_flash_lite_preview",
                percent: 100,
              },
              {
                key: "model:tab_jump_flash_lite_preview",
                label: "tab_jump_flash_lite_preview",
                percent: 100,
              },
              {
                key: "model:gemini-2.5-flash-thinking",
                label: "Gemini 3.1 Flash Lite [gemini-2.5-flash-thinking]",
                percent: 100,
              },
              {
                key: "model:gemini-2.5-pro",
                label: "Gemini 2.5 Pro [gemini-2.5-pro]",
                percent: 100,
              },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(
      within(cards).getByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).toBeInTheDocument();
    expect(within(cards).queryByText("chat_20706")).not.toBeInTheDocument();
    expect(within(cards).queryByText("chat_23310")).not.toBeInTheDocument();
    expect(within(cards).queryByText("tab_flash_lite_preview")).not.toBeInTheDocument();
    expect(within(cards).queryByText("tab_jump_flash_lite_preview")).not.toBeInTheDocument();
    expect(
      within(cards).queryByText("Gemini 3.1 Flash Lite [gemini-2.5-flash-thinking]"),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText("Gemini 2.5 Pro [gemini-2.5-pro]")).not.toBeInTheDocument();
  });

  test("cards view does not show verbose antigravity model metadata under quota bars", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
                meta: "Default Agent · Recommended · maxTokens=1048576 · maxOutputTokens=65535 · apiProvider=API_PROVIDER_GOOGLE_GEMINI · model=MODEL_PLACEHOLDER_M37 · thinking · images · video",
              },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(
      within(cards).getByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).toBeInTheDocument();
    expect(within(cards).getByText("91%")).toBeInTheDocument();
    expect(within(cards).queryByText(/maxTokens=1048576/)).not.toBeInTheDocument();
    expect(within(cards).queryByText(/maxOutputTokens=65535/)).not.toBeInTheDocument();
    expect(
      within(cards).queryByText(/apiProvider=API_PROVIDER_GOOGLE_GEMINI/),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText(/model=MODEL_PLACEHOLDER_M37/)).not.toBeInTheDocument();
  });

  test("table quota hover does not show cached antigravity model metadata", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-low",
                label: "Gemini 3.1 Pro (Low) [gemini-3.1-pro-low]",
                percent: 91,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
                meta: "Recommended · maxTokens=1048576 · maxOutputTokens=65535 · apiProvider=API_PROVIDER_GOOGLE_GEMINI · modelProvider=MODEL_PROVIDER_GOOGLE · model=MODEL_PLACEHOLDER_M36 · tokenizer=LLAMA_WITH_SPECIAL · tag=New · thinkingBudget=1001 · minThinkingBudget=128 · thinking · images · video · recommended",
              },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(
      within(row as HTMLElement).getByText("Gemini 3.1 Pro (Low) [gemini-3.1-pro-low]"),
    );

    const tooltip = await screen.findByRole("tooltip");
    expect(
      within(tooltip).getByText("Gemini 3.1 Pro (Low) [gemini-3.1-pro-low]"),
    ).toBeInTheDocument();
    expect(within(tooltip).queryByText(/maxTokens=1048576/)).not.toBeInTheDocument();
    expect(
      within(tooltip).queryByText(/apiProvider=API_PROVIDER_GOOGLE_GEMINI/),
    ).not.toBeInTheDocument();
    expect(
      within(tooltip).queryByText(/modelProvider=MODEL_PROVIDER_GOOGLE/),
    ).not.toBeInTheDocument();
  });

  test("table quota hover opens only the quota details tooltip", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(320);

    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 100,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
              },
              {
                key: "model:claude-sonnet-4-6",
                label: "Claude Sonnet 4.6 (Thinking) [claude-sonnet-4-6]",
                percent: 100,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
              },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(
      within(row as HTMLElement).getByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    );

    const tooltips = await screen.findAllByRole("tooltip");
    expect(tooltips).toHaveLength(1);
    expect(
      within(tooltips[0]).getByText("Claude Sonnet 4.6 (Thinking) [claude-sonnet-4-6]"),
    ).toBeInTheDocument();
  });

  test("table quota preview and hover hide cached antigravity models skipped by the reference implementation", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              { key: "model:chat_20706", label: "chat_20706", percent: 100 },
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
              },
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

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("chat_20706")).not.toBeInTheDocument();
    const visibleModel = within(row as HTMLElement).getByText(
      "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
    );
    expect(visibleModel).toBeInTheDocument();

    fireEvent.mouseEnter(visibleModel);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).queryByText("chat_20706")).not.toBeInTheDocument();
    expect(
      within(tooltip).getByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).toBeInTheDocument();
  });

  test("cards view restores cached quota while refreshing in the background", async () => {
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
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now - 60_000,
            items: [
              { label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 44, resetAtMs: now + 120_000 },
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
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
  });

  test("cards view does not spin card refresh actions for tab-switch background quota refresh", async () => {
    const now = Date.now();
    const files = [
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: now,
        disabled: false,
      },
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
      {
        name: "codex-c.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "3",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify({ tab: "files", filter: "qwen", search: "", page: 1 }),
    );
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
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

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /codex/i }));
    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();

    await waitFor(() =>
      expect(mocks.fetchQuota).toHaveBeenCalledWith(
        "codex",
        expect.objectContaining({ name: "codex-a.json" }),
      ),
    );

    const cards = screen.getByTestId("auth-files-cards");
    const cardRefreshButtons = within(cards).getAllByRole("button", { name: "Refresh" });
    expect(cardRefreshButtons).toHaveLength(3);
    cardRefreshButtons.forEach((button) => {
      expect(button.querySelector("svg")).not.toHaveClass("animate-spin");
    });
  });

  test("toolbar refresh immediately spins the visible card quota refresh action", async () => {
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
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
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

    const cards = await screen.findByTestId("auth-files-cards");
    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());

    fireEvent.click(toolbarRefreshButton);

    const cardRefreshButton = within(cards).getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(cardRefreshButton.querySelector("svg")).toHaveClass("animate-spin"));
  });

  test("toolbar refresh immediately spins the visible table quota refresh action", async () => {
    const now = Date.now();
    const file = {
      name: "codex-table.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "3",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-table.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 64, resetAtMs: now + 60_000 }],
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

    expect(await screen.findByText("codex-table.json")).toBeInTheDocument();
    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());

    fireEvent.click(toolbarRefreshButton);

    const row = screen.getByText("codex-table.json").closest("tr");
    expect(row).not.toBeNull();
    const rowRefreshButton = within(row as HTMLElement).getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(rowRefreshButton.querySelector("svg")).toHaveClass("animate-spin"));
  });

  test("cards view refresh action only refreshes the clicked auth file", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
          },
          "codex-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 44, resetAtMs: now + 30_000 }],
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

    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");
    const firstCard = screen.getByText("codex-a.json").closest("section");
    expect(firstCard).not.toBeNull();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(mocks.fetchQuota).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ name: "codex-a.json" }),
    );
    expect(within(cards).getByText("codex-b.json")).toBeInTheDocument();
  });

  test("table refresh action only refreshes the clicked auth file", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 18, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
          },
          "codex-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 44, resetAtMs: now + 30_000 }],
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

    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();
    const row = screen.getByText("codex-a.json").closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(mocks.fetchQuota).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ name: "codex-a.json" }),
    );
    expect(screen.getByText("codex-b.json")).toBeInTheDocument();
  });

  test("cards view includes returned codex review 5h and additional quota bars", async () => {
    const now = Date.now();
    const file = {
      name: "codex-spark.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "7",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
        { label: "m_quota.review_5h", percent: 70, resetAtMs: now + 180_000 },
        { label: "m_quota.review_weekly", percent: 60, resetAtMs: now + 240_000 },
        { label: "GPT-5.3-Codex-Spark: 5h", percent: 100, resetAtMs: now + 300_000 },
        { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 360_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
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

    expect(await screen.findByText("codex-spark.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Review: 5h")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: 5h")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: Weekly")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  test("cards keep action buttons pinned to the bottom with mixed quota heights", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-basic.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "7",
      },
      {
        name: "codex-spark.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "8",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockImplementation(async (_provider, file) => ({
      items:
        file?.name === "codex-spark.json"
          ? [
              { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
              { label: "m_quota.review_5h", percent: 70, resetAtMs: now + 180_000 },
              { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 240_000 },
            ]
          : [
              { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
            ],
    }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
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

    const cards = await screen.findByTestId("auth-files-cards");
    expect(cards).toHaveClass("items-stretch");

    const refreshButtons = within(cards).getAllByRole("button", { name: "Refresh" });
    refreshButtons.forEach((button) => fireEvent.click(button));

    expect(await screen.findByText("GPT-5.3-Codex-Spark: Weekly")).toBeInTheDocument();

    const card = screen.getByText("codex-basic.json").closest("section");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("flex", "h-full", "flex-col");

    const quota = within(card as HTMLElement).getByTestId("auth-file-card-quota");
    const actions = quota.nextElementSibling;
    expect(actions).not.toBeNull();
    expect(actions).toHaveClass("mt-auto");
  });

  test("cards localize codex additional quota window labels in Chinese", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    const now = Date.now();
    const file = {
      name: "codex-spark.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "8",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "GPT-5.3-Codex-Spark: 5h", percent: 100, resetAtMs: now + 60_000 },
        { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 120_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
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

    expect(await screen.findByText("codex-spark.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "刷新" }),
    );

    expect(await screen.findByText("GPT-5.3-Codex-Spark: 五小时")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: 周")).toBeInTheDocument();
    expect(screen.queryByText("GPT-5.3-Codex-Spark: 5h")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-5.3-Codex-Spark: Weekly")).not.toBeInTheDocument();
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
      AUTH_FILES_DATA_CACHE_KEY,
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
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "free",
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

    await waitFor(() => {
      const raw = window.sessionStorage.getItem(AUTH_FILES_DATA_CACHE_KEY);
      expect(raw).toContain('"planType":"plus"');
    });
  });

  test("cards view uses cached quota plan badge instead of stale auth-file metadata", async () => {
    const now = Date.now();
    const staleFile = {
      name: "codex.json",
      label: "Codex Main",
      account_type: "oauth",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
      plan_type: "plus",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [staleFile] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [staleFile],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "pro",
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
    expect(screen.getByText("Plan Pro")).toBeInTheDocument();
    expect(screen.queryByText("Plan Plus")).not.toBeInTheDocument();
  });

  test("cards view exposes quota refresh for Anthropic OAuth files", async () => {
    const now = Date.now();
    const file = {
      name: "claude-oauth.json",
      label: "Claude Pro",
      account_type: "oauth",
      type: "claude",
      provider: "anthropic",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "claude-1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "claude_quota.five_hour", percent: 88, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "claude-oauth.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "claude_quota.five_hour", percent: 72, resetAtMs: now + 30_000 }],
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

    expect(await screen.findByText("Claude Pro")).toBeInTheDocument();
    const refreshButton = within(screen.getByTestId("auth-files-cards")).getByRole("button", {
      name: "Refresh",
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mocks.fetchQuota).toHaveBeenCalledWith(
        "claude",
        expect.objectContaining({ name: "claude-oauth.json" }),
      );
    });
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
      AUTH_FILES_DATA_CACHE_KEY,
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
      AUTH_FILES_DATA_CACHE_KEY,
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
