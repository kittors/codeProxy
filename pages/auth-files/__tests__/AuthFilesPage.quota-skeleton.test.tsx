import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import i18n from "@code-proxy/i18n";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] as AuthFileItem[] })),
  getStatus: vi.fn(async () => ({ items: [] as Array<Record<string, unknown>> })),
  startStatusRefresh: vi.fn(async () => ({ job_id: "job-1", accepted: 1, deduplicated: 0 })),
  getStatusRefreshJob: vi.fn(async () => ({
    job_id: "job-1",
    state: "completed" as const,
    total: 1,
    completed: 1,
    failed: 0,
    results: [] as Array<Record<string, unknown>>,
  })),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, list: mocks.list },
    aiAccountsStatusApi: {
      getStatus: mocks.getStatus,
      startStatusRefresh: mocks.startStatusRefresh,
      getStatusRefreshJob: mocks.getStatusRefreshJob,
    },
  };
});

const codexFile: AuthFileItem = {
  name: "codex-1.json",
  type: "codex",
  auth_index: "auth-1",
  auth_subject_id: "sub-1",
  size: 1024,
  modified: 0,
  disabled: false,
} as AuthFileItem;

const statusItemWithQuota = {
  auth_index: "auth-1",
  auth_subject_id: "sub-1",
  quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 50 }],
};

const renderPage = () =>
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

/** Leaves the account's probe in flight, so the card stays in its loading state. */
const holdRefresh = () => {
  mocks.startStatusRefresh.mockImplementation(() => new Promise(() => {}) as never);
};

const setViewMode = (mode: "cards" | "table") => {
  window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify(mode));
};

describe("AI accounts loading placeholders", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    setViewMode("cards");
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ files: [codexFile] });
    mocks.getStatus.mockReset();
    mocks.getStatus.mockResolvedValue({ items: [] });
    mocks.startStatusRefresh.mockReset();
    mocks.startStatusRefresh.mockResolvedValue({ job_id: "job-1", accepted: 1, deduplicated: 0 });
    mocks.getStatusRefreshJob.mockReset();
    mocks.getStatusRefreshJob.mockResolvedValue({
      job_id: "job-1",
      state: "completed",
      total: 1,
      completed: 1,
      failed: 0,
      results: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  test("cold list paints card-shaped placeholders in cards view", async () => {
    mocks.list.mockImplementation(() => new Promise(() => {}) as never);

    renderPage();

    const skeleton = await screen.findByTestId("auth-files-table-skeleton");
    expect(within(skeleton).getAllByTestId("auth-files-card-skeleton").length).toBeGreaterThan(1);
  });

  test("cold list keeps row-shaped placeholders in table view", async () => {
    setViewMode("table");
    mocks.list.mockImplementation(() => new Promise(() => {}) as never);

    renderPage();

    const skeleton = await screen.findByTestId("auth-files-table-skeleton");
    expect(within(skeleton).queryByTestId("auth-files-card-skeleton")).not.toBeInTheDocument();
  });

  test("the silent probe on entry places holders, not an empty state", async () => {
    // The account is unknown to the status read model, so the page has no
    // result for it yet while its first probe runs.
    holdRefresh();

    renderPage();

    const title = await screen.findByText("codex-1.json");
    const card = title.closest("section") as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByTestId("auth-file-card-quota-skeleton")).toBeInTheDocument();
    });
    expect(within(card).queryByTestId("auth-file-card-quota-empty")).not.toBeInTheDocument();
  });

  test("a card with no quota yet shows bar placeholders while its probe runs", async () => {
    renderPage();

    const title = await screen.findByText("codex-1.json");
    const card = title.closest("section") as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByTestId("auth-file-card-quota-empty")).toBeInTheDocument();
    });

    holdRefresh();
    fireEvent.click(within(card).getAllByRole("button", { name: "Refresh" })[0]!);

    await waitFor(() => {
      expect(within(card).getByTestId("auth-file-card-quota-skeleton")).toBeInTheDocument();
    });
    // The placeholder replaces the empty state rather than sitting beside it.
    expect(within(card).queryByTestId("auth-file-card-quota-empty")).not.toBeInTheDocument();
  });

  test("a card that already has quota refreshes in place, without placeholders", async () => {
    mocks.getStatus.mockResolvedValue({ items: [statusItemWithQuota] });

    renderPage();

    const title = await screen.findByText("codex-1.json");
    const card = title.closest("section") as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByText("50%")).toBeInTheDocument();
    });

    holdRefresh();
    fireEvent.click(within(card).getAllByRole("button", { name: "Refresh" })[0]!);

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalled();
    });
    expect(within(card).queryByTestId("auth-file-card-quota-skeleton")).not.toBeInTheDocument();
    expect(within(card).getByText("50%")).toBeInTheDocument();
  });

  test("table view shows chip placeholders instead of a dash while probing", async () => {
    setViewMode("table");

    renderPage();

    const cell = await screen.findByText("codex-1.json");
    const row = cell.closest("tr") as HTMLElement;
    await waitFor(() => {
      expect(row).not.toBeNull();
    });

    holdRefresh();
    fireEvent.click(within(row).getAllByRole("button", { name: "Refresh" })[0]!);

    await waitFor(() => {
      expect(within(row).getByTestId("auth-file-quota-grid-skeleton")).toBeInTheDocument();
    });
  });
});
