import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import {
  AUTH_FILES_DATA_CACHE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_UI_STATE_KEY,
} from "@code-proxy/domain";
import i18n from "@code-proxy/i18n";

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
  getAuthFileTrend: vi.fn(async () => ({
    auth_index: "auth-1",
    days: 7,
    hours: 5,
    request_total: 3,
    cycle_request_total: 2,
    cycle_cost_total: 1.2345,
    weekly_quota_used_percent: 8,
    cycle_start: "2026-04-27T16:01:21Z",
    daily_usage: [{ date: "2026-04-30", requests: 2, cost: 0.0123 }],
    hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.0045 }],
    quota_series: [],
  })),
  getUsageLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 200 })),
  getAuthFileGroupTrend: vi.fn(async () => ({
    days: 7,
    group: "all",
    points: [{ date: new Date().toISOString().slice(0, 10), requests: 9 }],
  })),
  recordAuthFileQuotaSnapshot: vi.fn(async () => ({})),
  fetchQuota: vi.fn((_provider?: unknown, _file?: { name?: string }) => new Promise(() => {})),
  deleteFile: vi.fn(async () => ({})),
  downloadText: vi.fn(async () => "{}"),
  patchFields: vi.fn(async () => ({})),
  getModelsForAuthFile: vi.fn(async () => [{ id: "live-only", owned_by: "runtime" }]),
  getModelConfigs: vi.fn(async () => [
    { id: "gpt-4.1", owned_by: "openai" },
    { id: "claude-sonnet-4-5", owned_by: "anthropic" },
  ]),
  getModelOwnerPresets: vi.fn(async () => [
    { value: "openai", label: "OpenAI", description: "OpenAI models", enabled: true },
    { value: "anthropic", label: "Anthropic", description: "Anthropic models", enabled: true },
  ]),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  saveAuthGroupModelOwnerMapping: vi.fn(async (_authGroup: string, _owner: string) => undefined),
  upload: vi.fn(async () => ({})),
  submitCallback: vi.fn(async () => ({})),
  getAuthStatus: vi.fn(async () => ({ status: "pending" })),
  startAuth: vi.fn(async () => ({ url: "https://example.test/oauth", state: "state-1" })),
  reconcile: vi.fn(async () => ({})),
}));

let authGroupOwnerMappingMap: Record<string, string> = {};

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      deleteFile: mocks.deleteFile,
      downloadText: mocks.downloadText,
      patchFields: mocks.patchFields,
      getModelsForAuthFile: mocks.getModelsForAuthFile,
      upload: mocks.upload,
    },
    oauthApi: {
      ...mod.oauthApi,
      submitCallback: mocks.submitCallback,
      getAuthStatus: mocks.getAuthStatus,
      startAuth: mocks.startAuth,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
      saveAuthGroupModelOwnerMapping: mocks.saveAuthGroupModelOwnerMapping,
    },
    quotaApi: { ...mod.quotaApi, reconcile: mocks.reconcile },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
      getAuthFileTrend: mocks.getAuthFileTrend,
      getUsageLogs: mocks.getUsageLogs,
      getAuthFileGroupTrend: mocks.getAuthFileGroupTrend,
      recordAuthFileQuotaSnapshot: mocks.recordAuthFileQuotaSnapshot,
    },
  };
});

vi.mock("@features/quota-preview/quota-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@features/quota-preview/quota-fetch")>();
  return { ...mod, fetchQuota: mocks.fetchQuota };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
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

const decodeBase64UrlJson = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const useTableFilesView = () => {
  window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
};

async function selectFileGroup(name: string | RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "File group" }));
  await user.click(await screen.findByRole("option", { name }));
}

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
    mocks.getAuthFileTrend.mockReset();
    mocks.getAuthFileTrend.mockImplementation(async () => ({
      auth_index: "auth-1",
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_cost_total: 1.2345,
      weekly_quota_used_percent: 8,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [{ date: "2026-04-30", requests: 2, cost: 0.0123 }],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.0045 }],
      quota_series: [],
    }));
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
    mocks.recordAuthFileQuotaSnapshot.mockReset();
    mocks.recordAuthFileQuotaSnapshot.mockImplementation(async () => ({}));
    mocks.fetchQuota.mockReset();
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));
    mocks.deleteFile.mockReset();
    mocks.deleteFile.mockImplementation(async () => ({}));
    mocks.downloadText.mockReset();
    mocks.downloadText.mockImplementation(async () => "{}");
    mocks.patchFields.mockReset();
    mocks.patchFields.mockImplementation(async () => ({}));
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
    authGroupOwnerMappingMap = {};
    mocks.getAuthGroupModelOwnerMappingMap.mockReset();
    mocks.getAuthGroupModelOwnerMappingMap.mockImplementation(async () => ({
      ...authGroupOwnerMappingMap,
    }));
    mocks.saveAuthGroupModelOwnerMapping.mockReset();
    mocks.saveAuthGroupModelOwnerMapping.mockImplementation(
      async (authGroup: string, owner: string) => {
        if (owner) authGroupOwnerMappingMap[authGroup] = owner;
        else delete authGroupOwnerMappingMap[authGroup];
      },
    );
    mocks.upload.mockReset();
    mocks.upload.mockImplementation(async () => ({}));
    mocks.submitCallback.mockReset();
    mocks.submitCallback.mockImplementation(async () => ({}));
    mocks.getAuthStatus.mockReset();
    mocks.getAuthStatus.mockImplementation(async () => ({ status: "pending" }));
    mocks.startAuth.mockReset();
    mocks.startAuth.mockImplementation(async () => ({
      url: "https://example.test/oauth",
      state: "state-1",
    }));
    mocks.reconcile.mockReset();
    mocks.reconcile.mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("defaults to card view for auth files and keeps actions available", async () => {
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
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add OAuth Login" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selection actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select current page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete All" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable/Disable" })).toBeInTheDocument();
  });

  test("collapses filters behind a single mobile filter control", async () => {
    const user = userEvent.setup();
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

    const mobileToggle = screen.getByTestId("auth-files-mobile-filter-toggle");
    const mobilePanel = screen.getByTestId("auth-files-mobile-filter-panel");
    expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
    expect(mobilePanel).toHaveClass("hidden");

    await user.click(mobileToggle);

    expect(mobileToggle).toHaveAttribute("aria-expanded", "true");
    expect(mobilePanel).not.toHaveClass("hidden");
  });

  test("filters auth file cards by status buckets", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-limited.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "auth",
              http_status: 429,
              quota_exceeded: true,
              status: "error",
              status_message: "usage limit",
            },
          ],
        },
        {
          name: "codex-other-error.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          status: "error",
          status_message: "bad token",
          unavailable: true,
        },
        {
          name: "codex-disabled.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: true,
        },
        {
          name: "qwen-ok.json",
          type: "qwen",
          size: 1024,
          modified: now,
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

    expect(await screen.findByText("codex-limited.json")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    expect(screen.getByRole("option", { name: /429/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Other errors/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Disabled/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /429/ }));

    expect(screen.getByText("codex-limited.json")).toBeInTheDocument();
    expect(screen.queryByText("codex-other-error.json")).not.toBeInTheDocument();
    expect(screen.queryByText("codex-disabled.json")).not.toBeInTheDocument();
    expect(screen.queryByText("qwen-ok.json")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: /Other errors/ }));

    expect(screen.queryByText("codex-limited.json")).not.toBeInTheDocument();
    expect(screen.getByText("codex-other-error.json")).toBeInTheDocument();
    expect(screen.queryByText("codex-disabled.json")).not.toBeInTheDocument();
    expect(screen.queryByText("qwen-ok.json")).not.toBeInTheDocument();
  });

  test("keeps bulk selection collapsed until files are selected", async () => {
    const user = userEvent.setup();
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
    expect(screen.getByRole("button", { name: "Selection actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select current page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selection actions" }));

    expect(screen.getByRole("menuitem", { name: "Select current page" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Select filtered results" })).toBeInTheDocument();
  });

  test("uploads multiple auth files from pasted JSON objects", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          JSON.stringify({ type: "codex", account_id: "acct-one", access_token: "token-one" }),
          JSON.stringify({ type: "kimi", account_id: "acct-two", refresh_token: "token-two" }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File], [File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual([
      "codex-acct-one.json",
      "kimi-acct-two.json",
    ]);
    const uploadedJson = await Promise.all(
      uploadCalls.map(async ([file]) => JSON.parse(await file.text()) as Record<string, unknown>),
    );
    expect(uploadedJson).toEqual([
      { type: "codex", account_id: "acct-one", access_token: "token-one" },
      { type: "kimi", account_id: "acct-two", refresh_token: "token-two" },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
  });

  test("shows upload progress while pasted auth files are uploading", async () => {
    const firstUpload = createDeferred<{}>();
    const secondUpload = createDeferred<{}>();
    mocks.upload
      .mockImplementationOnce(() => firstUpload.promise)
      .mockImplementationOnce(() => secondUpload.promise);

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
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          JSON.stringify({ type: "codex", account_id: "acct-one", access_token: "token-one" }),
          JSON.stringify({ type: "kimi", account_id: "acct-two", refresh_token: "token-two" }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-files-upload-progress-title")).toHaveTextContent(
        "Uploading 0 / 2",
      ),
    );
    expect(screen.queryByTestId("auth-files-json-upload-progress")).not.toBeInTheDocument();

    await act(async () => {
      firstUpload.resolve({});
      await firstUpload.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-files-upload-progress-title")).toHaveTextContent(
        "Uploading 1 / 2",
      ),
    );

    await act(async () => {
      secondUpload.resolve({});
      await secondUpload.promise;
    });

    await waitFor(() =>
      expect(screen.queryByTestId("auth-files-upload-progress")).not.toBeInTheDocument(),
    );
  });

  test("expands pasted codex export bundles into synthesized auth files", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          "=== 卡密内容 ===",
          JSON.stringify({
            exported_at: "2026-05-22T19:59:51.483Z",
            proxies: [],
            accounts: [
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-one",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T19:59:51.483Z",
                },
              },
            ],
          }),
          JSON.stringify({
            exported_at: "2026-05-22T20:02:43.650Z",
            proxies: [],
            accounts: [
              {
                name: "beta@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-two",
                  chatgpt_account_id: "acct-222",
                  chatgpt_user_id: "user-222",
                  email: "beta@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "beta@example.test",
                  last_refresh: "2026-05-22T20:02:43.650Z",
                },
              },
            ],
          }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File], [File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual([
      "codex-alpha@example.test-plus.json",
      "codex-beta@example.test-plus.json",
    ]);

    const uploadedJson = await Promise.all(
      uploadCalls.map(async ([file]) => JSON.parse(await file.text()) as Record<string, unknown>),
    );
    const firstLastRefresh = String(uploadedJson[0]?.last_refresh ?? "");
    const secondLastRefresh = String(uploadedJson[1]?.last_refresh ?? "");
    expect(firstLastRefresh).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    expect(secondLastRefresh).toBe(firstLastRefresh);

    expect(uploadedJson).toEqual([
      expect.objectContaining({
        type: "codex",
        account_id: "acct-111",
        chatgpt_account_id: "acct-111",
        email: "alpha@example.test",
        name: "alpha@example.test",
        plan_type: "plus",
        chatgpt_plan_type: "plus",
        id_token_synthetic: true,
        access_token: "access-token-one",
        refresh_token: "",
        last_refresh: firstLastRefresh,
        expired: "2026-06-01T17:08:08.000Z",
      }),
      expect.objectContaining({
        type: "codex",
        account_id: "acct-222",
        chatgpt_account_id: "acct-222",
        email: "beta@example.test",
        name: "beta@example.test",
        plan_type: "plus",
        chatgpt_plan_type: "plus",
        id_token_synthetic: true,
        access_token: "access-token-two",
        refresh_token: "",
        last_refresh: firstLastRefresh,
        expired: "2026-06-01T17:08:08.000Z",
      }),
    ]);

    const firstToken = String(uploadedJson[0]?.id_token ?? "");
    const [firstHeaderPart, firstPayloadPart, firstSignaturePart] = firstToken.split(".");
    expect(firstSignaturePart).toBe("synthetic");
    expect(decodeBase64UrlJson(firstHeaderPart)).toMatchObject({
      alg: "none",
      typ: "JWT",
      cpa_synthetic: true,
    });
    expect(decodeBase64UrlJson(firstPayloadPart)).toMatchObject({
      iat: Math.floor(Date.parse(firstLastRefresh) / 1000),
      exp: Math.floor(Date.parse("2026-06-01T17:08:08.000Z") / 1000),
      email: "alpha@example.test",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-111",
        chatgpt_plan_type: "plus",
        chatgpt_user_id: "user-111",
        user_id: "user-111",
      },
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
  });

  test("skips duplicate codex accounts that are already in the list or repeated in the pasted bundle", async () => {
    const existingAlpha = {
      name: "codex-alpha@example.test-plus.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      email: "alpha@example.test",
      label: "alpha@example.test",
      account_id: "acct-111",
      chatgpt_account_id: "acct-111",
      auth_index: "auth-alpha",
      size: 1024,
      modified: Date.now(),
      disabled: false,
    };
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "qwen.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
        existingAlpha,
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

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          "=== 卡密内容 ===",
          JSON.stringify({
            exported_at: "2026-05-22T20:11:27.181Z",
            proxies: [],
            accounts: [
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-one",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
              {
                name: "beta@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-two",
                  chatgpt_account_id: "acct-222",
                  chatgpt_user_id: "user-222",
                  email: "beta@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "beta@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-three",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
            ],
          }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual(["codex-beta@example.test-plus.json"]);
  });

  test("refreshes pasted auth files and quotas from the latest uploaded list", async () => {
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    const now = Date.now();
    const initialFile = {
      name: "qwen.json",
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
    };
    const uploadedFile = {
      name: "auth-server-renamed.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex",
      chatgpt_account_id: "acct-123",
      size: 2048,
      modified: now + 1,
      disabled: false,
    };
    mocks.list
      .mockImplementationOnce(async () => ({ files: [initialFile] }))
      .mockImplementationOnce(async () => ({ files: [initialFile, uploadedFile] }));
    mocks.fetchQuota.mockImplementation(async () => ({ items: [] }));

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
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: JSON.stringify({
          chatgpt_account_id: "acct-123",
          client_id: "app_test",
          access_token: "token",
          id_token: "id-token",
        }),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    expect(await screen.findByText("auth-server-renamed.json")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetchQuota).toHaveBeenCalledWith(
        "codex",
        expect.objectContaining({
          name: "auth-server-renamed.json",
          chatgpt_account_id: "acct-123",
        }),
      ),
    );
  });

  test("shows an error for invalid pasted auth JSON", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: { value: '{"type":"codex"' },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    expect(
      await within(dialog).findByText(
        "Please paste valid JSON objects or a JSON array of objects.",
      ),
    ).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  test("keeps table action buttons on a single row", async () => {
    useTableFilesView();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          type: "codex",
          account_type: "oauth",
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

    const row = await screen.findByRole("row", { name: /codex-pro\.json/ });
    const actionGroup = within(row).getByRole("button", { name: "Refresh" }).closest("div");
    const actionHeader = screen.getByRole("columnheader", { name: "Action" });

    expect(actionGroup).not.toBeNull();
    expect(actionGroup).toHaveClass("inline-flex");
    expect(actionGroup).toHaveClass("whitespace-nowrap");
    expect(actionGroup).not.toHaveClass("flex-wrap");
    expect(actionHeader).toHaveClass("w-48");
  });

  test("loads initial usage stats only for listed auth files", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "codex-pro.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          auth_index: "auth-codex",
        },
        {
          name: "kimi-a.json",
          type: "kimi",
          size: 1024,
          modified: now,
          disabled: false,
          auth_index: "auth-kimi",
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

    expect(await screen.findByText("codex-pro.json")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getEntityStats).toHaveBeenCalledWith(30, "all", {
        authIndexes: ["auth-codex", "auth-kimi"],
        sources: ["t:codex-pro.json", "t:codex-pro", "t:kimi-a.json", "t:kimi-a"],
      });
    });
  });

  test("shows active auth-level restriction badge with reason and recovery tooltip", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "codex.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "auth",
              http_status: 401,
              status_message: "unauthorized",
              next_retry_after: new Date(now + 34 * 60_000 + 50_000).toISOString(),
            },
          ],
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

    const badge = await screen.findByText("401 Error");
    const tooltipTrigger = badge.closest("[aria-describedby]") ?? badge;
    fireEvent.mouseEnter(tooltipTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("unauthorized");
    expect(tooltip).toHaveTextContent("Auto recovery in");
  });

  test("hides model-scoped transport errors from table restriction badges", async () => {
    useTableFilesView();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(640);

    const now = Date.now();
    const rawError =
      'Post "https://chatgpt.com/backend-api/codex/responses": read tcp [2607:8700:5500:8131::2]:44434->[2a06:98c1:310b::ac40:9bd1]:443: read: connection reset by peer';
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "free",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "model",
              model: "gpt-5.4",
              status: "error",
              status_message: rawError,
            },
          ],
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

    const title = await screen.findByText("A_GptPro");
    const row = title.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("500 Error")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("429 Error")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(rawError)).not.toBeInTheDocument();
  });

  test("cards view hides model-scoped transient errors from badge rows", async () => {
    const now = Date.now();
    const rawError = "context canceled";
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "free",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "model",
              model: "gpt-5.4",
              status: "error",
              status_message: rawError,
            },
          ],
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

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("500 Error")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("429 Error")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(rawError)).not.toBeInTheDocument();
  });

  test("cards view shows auth-level quota recovery records with a clean 429 tooltip", async () => {
    const now = Date.now();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-plus.json",
          label: "Codex Plus",
          account_type: "oauth",
          type: "codex",
          plan_type: "plus",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "auth",
              http_status: 429,
              quota_exceeded: true,
              reason: "quota",
              quota_window: "5h",
              quota_window_minutes: 300,
              status: "error",
              status_message: '{"error":{"type":"usage_limit_reached","message":"usage limit"}}',
              unavailable: true,
              next_retry_after: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
            },
          ],
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

    const title = await screen.findByText("Codex Plus");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    const badge = within(card as HTMLElement).getByText("429 Error");
    const tooltipTrigger = badge.closest("[aria-describedby]") ?? badge;
    fireEvent.mouseEnter(tooltipTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Requests are limited");
    expect(tooltip).toHaveTextContent("5h");
    expect(tooltip).toHaveTextContent("Auto recovery in");
    expect(tooltip).not.toHaveTextContent("usage_limit_reached");
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

    // Should render immediately from localStorage cache (no blank state)
    expect(screen.getByText("qwen.json")).toBeInTheDocument();
  });

  test("refreshes visible quota when entering auth files from another route with auto-refresh off", async () => {
    const now = Date.now();
    const file = {
      name: "codex-visible.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex-visible",
      chatgpt_account_id: "acct-visible",
      size: 1024,
      modified: now,
      disabled: false,
    };

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 88 }],
    });
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-visible.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 22 }],
          },
        },
      }),
    );

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
      { initialEntries: ["/api-keys"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("api keys")).toBeInTheDocument();
    await act(async () => {
      await router.navigate("/auth-files");
    });

    expect(await screen.findByText("codex-visible.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(mocks.fetchQuota).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ name: file.name }),
    );
  });

  test("refreshes quota for a newly authorized auth file", async () => {
    const now = Date.now();
    const initialFile = {
      name: "qwen.json",
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
    };
    const authorizedFile = {
      name: "codex-authorized.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex-authorized",
      chatgpt_account_id: "acct-authorized",
      size: 2048,
      modified: now + 1,
      disabled: false,
    };

    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list
      .mockImplementationOnce(async () => ({ files: [initialFile] }))
      .mockImplementation(async () => ({ files: [initialFile, authorizedFile] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 91 }],
    });

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
    fireEvent.click(screen.getByRole("button", { name: "Add OAuth Login" }));

    const dialog = await screen.findByRole("dialog", { name: "Add OAuth Login" });
    fireEvent.change(
      within(dialog).getByPlaceholderText("Paste the full callback URL from browser"),
      {
        target: { value: "http://localhost:1455/auth/callback?code=ok" },
      },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit callback" }));

    expect(await screen.findByText("codex-authorized.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(mocks.fetchQuota).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ name: "codex-authorized.json" }),
    );
  });

  test("reads quota preview setting from localStorage", async () => {
    useTableFilesView();
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

  test("cards view only shows non-duplicated auth-file tags", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: ["vip-team"],
          hidden_default_tags: [],
          display_tags: ["codex", "pro", "vip-team"],
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

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("vip-team")).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText(/^codex$/i)).toHaveLength(1);
    expect(within(card as HTMLElement).queryByText(/^pro$/i)).not.toBeInTheDocument();
  });

  test("cards view shows the auth-file success rate beside call volume", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          auth_index: "77",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getEntityStats.mockImplementation(
      async () =>
        ({
          source: [],
          auth_index: [
            { entity_name: "77", requests: 5, failed: 1, avg_latency: 0, total_tokens: 0 },
          ],
        }) as any,
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

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("5 calls")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Success Rate")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("80.0%")).toBeInTheDocument();
  });

  test("filters auth files by custom tag options", async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-vip.json",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["vip-team"],
          display_tags: ["vip-team"],
        },
        {
          name: "qwen-lab.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["lab"],
          display_tags: ["lab"],
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

    expect(await screen.findByText("codex-vip.json")).toBeInTheDocument();
    expect(screen.getByText("qwen-lab.json")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    await user.click(screen.getByRole("option", { name: "vip-team" }));

    expect(screen.getByText("codex-vip.json")).toBeInTheDocument();
    expect(screen.queryByText("qwen-lab.json")).not.toBeInTheDocument();
    expect(screen.getByText("Total 1 · Page 1 / 1")).toBeInTheDocument();
  });

  test("keeps custom tag filter options stable while searching", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-tagged.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          custom_tags: ["vip-team"],
          display_tags: ["vip-team"],
        },
        {
          name: "codex-plain.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "qwen-plain.json",
          type: "qwen",
          size: 1024,
          modified: now,
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

    expect(await screen.findByText("codex-tagged.json")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Custom tag" })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Filename / provider / type"), "plain");

    expect(screen.queryByText("codex-tagged.json")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Custom tag" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    expect(screen.getByRole("option", { name: "vip-team" })).toBeInTheDocument();
  });

  test("keeps type filter counts stable while searching", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-alpha.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "codex-beta.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "qwen-lab.json",
          type: "qwen",
          size: 1024,
          modified: now,
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

    expect(await screen.findByText("codex-alpha.json")).toBeInTheDocument();
    const fileGroupSelect = screen.getByRole("combobox", { name: "File group" });
    expect(fileGroupSelect).toHaveTextContent("All (3)");
    await user.click(fileGroupSelect);
    expect(await screen.findByRole("option", { name: /codex\s*2/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /qwen\s*1/i })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /All\s*3/i }));

    await user.type(screen.getByPlaceholderText("Filename / provider / type"), "alpha");

    expect(screen.getByText("codex-alpha.json")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("codex-beta.json")).not.toBeInTheDocument());
    expect(screen.queryByText("qwen-lab.json")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "File group" })).toHaveTextContent("All (3)");
  });

  test("refreshes only the clicked auth-file card usage stats after quota refresh", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-pro-a.json",
        label: "A_GptPro",
        account_type: "oauth",
        type: "codex",
        auth_index: "77",
        size: 1024,
        modified: now,
        disabled: false,
      },
      {
        name: "codex-pro-b.json",
        label: "B_GptPro",
        account_type: "oauth",
        type: "codex",
        auth_index: "88",
        size: 1024,
        modified: now,
        disabled: false,
      },
    ] as any[];
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        quotaByFileName: {
          "codex-pro-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 80 }],
          },
          "codex-pro-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 80 }],
          },
        },
      }),
    );
    mocks.list.mockImplementation(async () => ({ files }));
    mocks.getEntityStats
      .mockResolvedValueOnce({
        source: [],
        auth_index: [
          { entity_name: "77", requests: 1, failed: 0, avg_latency: 0, total_tokens: 0 },
          { entity_name: "88", requests: 10, failed: 0, avg_latency: 0, total_tokens: 0 },
        ],
      } as any)
      .mockResolvedValueOnce({
        source: [],
        auth_index: [
          { entity_name: "77", requests: 4, failed: 1, avg_latency: 0, total_tokens: 0 },
          { entity_name: "88", requests: 99, failed: 0, avg_latency: 0, total_tokens: 0 },
        ],
      } as any);
    mocks.fetchQuota.mockImplementation(async () => [
      { key: "code_5h", label: "m_quota.code_5h", percent: 60 },
    ]);

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

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    const otherTitle = await screen.findByText("B_GptPro");
    const otherCard = otherTitle.closest("section");
    expect(otherCard).not.toBeNull();
    expect(await within(card as HTMLElement).findByText("1 calls")).toBeInTheDocument();
    expect(await within(otherCard as HTMLElement).findByText("10 calls")).toBeInTheDocument();

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(2));
    mocks.fetchQuota.mockClear();

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.fetchQuota).toHaveBeenCalledTimes(1);
      expect(mocks.getEntityStats).toHaveBeenCalledTimes(2);
      expect(mocks.getEntityStats).toHaveBeenLastCalledWith(30, "all", {
        authIndexes: ["77"],
        sources: ["t:codex-pro-a.json", "t:codex-pro-a"],
      });
      expect(within(card as HTMLElement).getByText("4 calls")).toBeInTheDocument();
      expect(within(otherCard as HTMLElement).getByText("10 calls")).toBeInTheDocument();
      expect(within(otherCard as HTMLElement).queryByText("99 calls")).not.toBeInTheDocument();
    });
  });

  test("keeps the refresh button spinning and refreshes auth files in batches of two", async () => {
    const now = Date.now();
    const files = Array.from({ length: 9 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      chatgpt_account_id: `acct-${index + 1}`,
      size: 1024,
      modified: now,
      disabled: false,
    }));
    type QuotaRefreshDeferred = {
      promise: Promise<{ items: Array<{ label: string; percent: number }> }>;
      resolve: (value: { items: Array<{ label: string; percent: number }> }) => void;
      reject: (reason?: unknown) => void;
    };
    const deferredQueue = Array.from({ length: files.length * 2 }, () =>
      createDeferred<{ items: Array<{ label: string; percent: number }> }>(),
    );
    const startedDeferreds: QuotaRefreshDeferred[] = [];
    let activeFetches = 0;
    let maxActiveFetches = 0;

    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          files.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22 }],
            },
          ]),
        ),
      }),
    );

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockImplementation(() => {
      const deferred = deferredQueue.shift();
      if (!deferred) throw new Error("unexpected fetchQuota call");
      startedDeferreds.push(deferred);
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      return deferred.promise.finally(() => {
        activeFetches -= 1;
      });
    });

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

    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    for (let index = 0; index < files.length; index += 2) {
      await waitFor(() =>
        expect(mocks.fetchQuota).toHaveBeenCalledTimes(Math.min(files.length, index + 2)),
      );
      const warmupDeferreds = startedDeferreds.splice(0);
      await act(async () => {
        warmupDeferreds.forEach((deferred) =>
          deferred.resolve({ items: [{ label: "m_quota.code_5h", percent: 60 }] }),
        );
      });
    }
    await waitFor(() => expect(activeFetches).toBe(0));
    mocks.fetchQuota.mockClear();
    maxActiveFetches = 0;

    const refreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    expect(refreshButton).toBeEnabled();

    fireEvent.click(refreshButton);

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(2));
    expect(refreshButton.querySelector("svg")).toHaveClass("animate-spin");
    expect(maxActiveFetches).toBe(2);

    for (let index = 0; index < files.length; index += 2) {
      const batch = startedDeferreds.slice(index, index + 2);
      await act(async () => {
        batch.forEach((deferred) =>
          deferred.resolve({ items: [{ label: "m_quota.code_5h", percent: 60 }] }),
        );
      });

      await waitFor(() =>
        expect(mocks.fetchQuota).toHaveBeenCalledTimes(Math.min(files.length, index + 4)),
      );
    }

    await waitFor(() => expect(refreshButton.querySelector("svg")).not.toHaveClass("animate-spin"));
    expect(maxActiveFetches).toBeLessThanOrEqual(2);
  });

  test("switching to all refreshes the visible page even when file names stay the same", async () => {
    const now = Date.now();
    const codexFiles = Array.from({ length: 10 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: String(index + 1),
    }));
    const files = [
      ...codexFiles,
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: now,
        disabled: false,
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 66, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(10000));
    window.localStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify({ tab: "files", filter: "codex", search: "", page: 1 }),
    );
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          codexFiles.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
            },
          ]),
        ),
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

    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(9));
    mocks.fetchQuota.mockClear();

    await selectFileGroup(/^All/i);

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(9));
    expect(mocks.fetchQuota.mock.calls.map(([, file]) => (file as { name: string }).name)).toEqual(
      codexFiles.slice(0, 9).map((file) => file.name),
    );
  });

  test("switching provider after entering from request logs refreshes visible cards with auto-refresh off", async () => {
    const now = Date.now();
    const qwenFiles = Array.from({ length: 2 }, (_, index) => ({
      name: `qwen-${index + 1}.json`,
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: `qwen-${index + 1}`,
    }));
    const codexFiles = Array.from({ length: 2 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: `codex-${index + 1}`,
    }));
    const files = [...qwenFiles, ...codexFiles] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 66, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify({ tab: "files", filter: "qwen", search: "", page: 1 }),
    );
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          qwenFiles.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
            },
          ]),
        ),
      }),
    );

    const router = createMemoryRouter(
      [
        { path: "/monitor/request-logs", element: <div>request logs</div> },
        {
          path: "/auth-files",
          element: (
            <ThemeProvider>
              <ToastProvider>
                <AuthFilesPage />
              </ToastProvider>
            </ThemeProvider>
          ),
        },
      ],
      { initialEntries: ["/monitor/request-logs"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("request logs")).toBeInTheDocument();
    await act(async () => {
      await router.navigate("/auth-files");
    });

    expect(await screen.findByText("qwen-1.json")).toBeInTheDocument();
    mocks.fetchQuota.mockClear();

    await selectFileGroup(/^codex\s*2/i);

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(2));
    expect(mocks.fetchQuota.mock.calls.map(([, file]) => (file as { name: string }).name)).toEqual(
      codexFiles.map((file) => file.name),
    );
  });

  test("cards view hides default auth-file badges when display tags are empty", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: ["codex", "pro"],
          display_tags: [],
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

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText(/^codex$/i)).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("Plan Pro")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("0 calls")).toBeInTheDocument();
  });

  test("table view hides default auth-file badges when display tags are empty", async () => {
    useTableFilesView();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: ["codex", "pro"],
          display_tags: [],
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

    const title = await screen.findByText("A_GptPro");
    const row = title.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText(/^codex$/i)).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Plan Pro")).not.toBeInTheDocument();
  });

  test("saves auth-file tag visibility and custom tags from the tags modal", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: [],
          display_tags: ["codex", "pro"],
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

    const user = userEvent.setup();
    expect(await screen.findByText("A_GptPro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit Tags" }));

    const dialog = await screen.findByRole("dialog", { name: "Auth File Tags" });
    fireEvent.change(within(dialog).getByLabelText("Custom tag"), { target: { value: "vip" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add tag" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "pro" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.patchFields).toHaveBeenCalledWith({
        name: "codex-pro.json",
        custom_tags: ["vip"],
        hidden_default_tags: ["pro"],
        display_tags: ["codex", "vip"],
      }),
    );
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
    useTableFilesView();
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
    const dialog = await screen.findByRole("dialog", { name: "Codex Subscriber" });
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
        screen.queryByRole("dialog", { name: "Codex Subscriber" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByTestId("auth-files-cards")).toHaveTextContent(/d left/));
  });

  test("opens usage trend cards for codex files inferred from dotted email file names", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pcamtu927@gmail.com-plus.json",
          type: "codex",
          auth_index: "auth-1",
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
    expect(cards).toHaveTextContent("pcamtu927@gmail.com");

    fireEvent.click(within(cards).getByRole("button", { name: "View" }));

    const dialog = await screen.findByRole("dialog", {
      name: "pcamtu927@gmail.com",
    });
    expect(within(dialog).getByText("Plus")).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(await within(dialog).findByText("Current cycle cost")).toBeInTheDocument();
    expect(within(dialog).getByText("$1.2345")).toBeInTheDocument();
    expect(mocks.getAuthFileTrend).toHaveBeenCalledWith("auth-1", { days: 7, hours: 5 });
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
    await selectFileGroup(/codex\s*1/i);

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
    expect(authGroupOwnerMappingMap).toEqual({});

    fireEvent.click(within(settingsDialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.saveAuthGroupModelOwnerMapping).toHaveBeenCalledWith("codex", "openai");
    });
    expect(authGroupOwnerMappingMap).toEqual({ codex: "openai" });

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog", { name: "Codex Main" });
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
    window.localStorage.setItem(
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

  test("cards view does not schedule quota countdown ticks when auto-refresh is off", async () => {
    const now = Date.parse("2026-05-12T08:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const intervalSpy = vi.spyOn(window, "setInterval");
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 10_000 }],
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
    expect(within(cards).getByText("10秒")).toBeInTheDocument();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 10_000)).toBe(false);
  });

  test("cards view keeps weekly quota reset separate from five-hour reset and hides file modified time", async () => {
    const now = Date.parse("2026-05-12T08:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;
    const modifiedText = new Date(now).toLocaleString();

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "code_5h",
                label: "m_quota.code_5h",
                percent: 100,
                resetAtMs: now + 5 * 60 * 60 * 1000,
              },
              {
                key: "code_week",
                label: "m_quota.code_weekly",
                percent: 0,
                resetAtMs: now + 6 * 24 * 60 * 60 * 1000,
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

    const title = await screen.findByText("codex.json");
    const card = title.closest("section");
    expect(card).not.toBeNull();

    expect(within(card as HTMLElement).getByText("5小时0秒")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("6天0秒")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(modifiedText)).not.toBeInTheDocument();
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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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
    useTableFilesView();
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
    window.localStorage.setItem(
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
    useTableFilesView();
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
    window.localStorage.setItem(
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
                resetAtMs: now + 65_000,
              },
              {
                key: "model:claude-sonnet-4-6",
                label: "Claude Sonnet 4.6 (Thinking) [claude-sonnet-4-6]",
                percent: 100,
                resetAtMs: now + 125_000,
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
    const resetText = Array.from(tooltips[0].querySelectorAll("span")).find(
      (element) =>
        element.textContent?.includes("秒") && element.className.includes("tabular-nums"),
    );
    expect(resetText).toBeTruthy();
    expect(resetText).not.toHaveClass("truncate");
    expect(tooltips[0]).not.toHaveClass("sm:max-w-[34rem]");
    expect(tooltips[0].querySelector(".quota-tooltip-grid")).toHaveClass(
      "w-[min(26rem,calc(100vw-2rem))]",
    );
  });

  test("table quota preview and hover hide cached antigravity models skipped by the reference implementation", async () => {
    useTableFilesView();

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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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

  test("cards view spins current-page refresh actions when switching provider filter and clears them per card", async () => {
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

    const codexDeferreds = {
      "codex-a.json": createDeferred<{
        items: { label: string; percent: number; resetAtMs: number }[];
      }>(),
      "codex-b.json": createDeferred<{
        items: { label: string; percent: number; resetAtMs: number }[];
      }>(),
      "codex-c.json": createDeferred<{
        items: { label: string; percent: number; resetAtMs: number }[];
      }>(),
    };

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockImplementation((_provider, file) => {
      const target = codexDeferreds[file?.name as keyof typeof codexDeferreds];
      if (target) return target.promise;
      return Promise.resolve({
        items: [{ label: "m_quota.code_5h", percent: 88, resetAtMs: now + 60_000 }],
      });
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify({ tab: "files", filter: "qwen", search: "", page: 1 }),
    );
    window.localStorage.setItem(
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
    await selectFileGroup(/codex\s*3/i);
    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();

    await waitFor(() =>
      expect(
        mocks.fetchQuota.mock.calls
          .filter(([, file]) =>
            String((file as { name?: string } | undefined)?.name).startsWith("codex-"),
          )
          .map(([, file]) => (file as { name: string }).name),
      ).toEqual(["codex-a.json", "codex-b.json", "codex-c.json"]),
    );

    const cards = screen.getByTestId("auth-files-cards");
    expect(
      within(cards)
        .getAllByText(/^codex-[abc]\.json$/)
        .map((node) => node.textContent),
    ).toEqual(["codex-a.json", "codex-b.json", "codex-c.json"]);

    const cardA = screen.getByText("codex-a.json").closest("section");
    const cardB = screen.getByText("codex-b.json").closest("section");
    const cardC = screen.getByText("codex-c.json").closest("section");
    expect(cardA).not.toBeNull();
    expect(cardB).not.toBeNull();
    expect(cardC).not.toBeNull();

    const refreshButtonA = within(cardA as HTMLElement).getByRole("button", { name: "Refresh" });
    const refreshButtonB = within(cardB as HTMLElement).getByRole("button", { name: "Refresh" });
    const refreshButtonC = within(cardC as HTMLElement).getByRole("button", { name: "Refresh" });

    await waitFor(() => {
      expect(refreshButtonA.querySelector("svg")).toHaveClass("animate-spin");
      expect(refreshButtonB.querySelector("svg")).toHaveClass("animate-spin");
      expect(refreshButtonC.querySelector("svg")).toHaveClass("animate-spin");
    });

    await act(async () => {
      codexDeferreds["codex-a.json"].resolve({
        items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
      });
      await codexDeferreds["codex-a.json"].promise;
    });

    await waitFor(() =>
      expect(refreshButtonA.querySelector("svg")).not.toHaveClass("animate-spin"),
    );
    expect(refreshButtonB.querySelector("svg")).toHaveClass("animate-spin");
    expect(refreshButtonC.querySelector("svg")).toHaveClass("animate-spin");

    await act(async () => {
      codexDeferreds["codex-b.json"].resolve({
        items: [{ label: "m_quota.code_5h", percent: 34, resetAtMs: now + 60_000 }],
      });
      codexDeferreds["codex-c.json"].resolve({
        items: [{ label: "m_quota.code_5h", percent: 56, resetAtMs: now + 60_000 }],
      });
      await Promise.all([
        codexDeferreds["codex-b.json"].promise,
        codexDeferreds["codex-c.json"].promise,
      ]);
    });

    await waitFor(() => {
      expect(refreshButtonA.querySelector("svg")).not.toHaveClass("animate-spin");
      expect(refreshButtonB.querySelector("svg")).not.toHaveClass("animate-spin");
      expect(refreshButtonC.querySelector("svg")).not.toHaveClass("animate-spin");
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
    window.localStorage.setItem(
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
    useTableFilesView();
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
    window.localStorage.setItem(
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

  test("toolbar refresh updates usage stats only for the current card page", async () => {
    const now = Date.now();
    const files = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        name: `auth-${number}.json`,
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: String(number),
      };
    }) as any[];
    const oldStats = files.map((file, index) => ({
      entity_name: file.auth_index,
      requests: index + 1,
      failed: 0,
      avg_latency: 0,
      total_tokens: 0,
    }));
    const nextStats = files.map((file, index) => ({
      entity_name: file.auth_index,
      requests: 101 + index,
      failed: 0,
      avg_latency: 0,
      total_tokens: 0,
    }));

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.getEntityStats
      .mockResolvedValue({ source: [], auth_index: nextStats } as any)
      .mockResolvedValueOnce({ source: [], auth_index: oldStats } as any)
      .mockResolvedValueOnce({ source: [], auth_index: nextStats } as any);
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 55, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: oldStats },
        quotaByFileName: Object.fromEntries(
          files.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
            },
          ]),
        ),
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

    const firstTitle = await screen.findByText("auth-1.json");
    const firstCard = firstTitle.closest("section");
    expect(firstCard).not.toBeNull();
    expect(within(firstCard as HTMLElement).getByText("1 calls")).toBeInTheDocument();

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(9));
    mocks.fetchQuota.mockClear();

    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());
    fireEvent.click(toolbarRefreshButton);

    await waitFor(() => {
      expect(mocks.fetchQuota).toHaveBeenCalledTimes(9);
      expect(within(firstCard as HTMLElement).getByText("101 calls")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const tenthTitle = await screen.findByText("auth-10.json");
    const tenthCard = tenthTitle.closest("section");
    expect(tenthCard).not.toBeNull();
    expect(within(tenthCard as HTMLElement).getByText("10 calls")).toBeInTheDocument();
    expect(within(tenthCard as HTMLElement).queryByText("110 calls")).not.toBeInTheDocument();
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
    window.localStorage.setItem(
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

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(2));
    mocks.fetchQuota.mockClear();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(mocks.fetchQuota).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({ name: "codex-a.json" }),
    );
    expect(within(cards).getByText("codex-b.json")).toBeInTheDocument();
  });

  test("table refresh action only refreshes the clicked auth file", async () => {
    useTableFilesView();
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
    window.localStorage.setItem(
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

    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(2));
    mocks.fetchQuota.mockClear();

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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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

  test("cards keep secondary actions inside a more actions menu", async () => {
    const user = userEvent.setup();
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
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
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

    const cards = await screen.findByTestId("auth-files-cards");
    const card = within(cards).getByText("codex.json").closest("section");
    expect(card).not.toBeNull();
    const cardView = within(card as HTMLElement);

    expect(cardView.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(cardView.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(cardView.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(cardView.queryByRole("button", { name: "Edit Tags" })).not.toBeInTheDocument();
    expect(cardView.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();

    await user.click(cardView.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit Tags" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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

  test("cards view shows codex team subscription quota instead of empty stable placeholders", async () => {
    const now = Date.now();
    const file = {
      name: "codex-team.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "team-1",
      plan_type: "team",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      planType: "team",
      items: [
        {
          key: "code_subscription_2628000",
          label: "m_quota.code_subscription",
          percent: 89,
          resetAtMs: now + 60_000,
          windowSeconds: 2628000,
        },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
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

    expect(await screen.findByText("codex-team.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: Subscription")).toBeInTheDocument();
    expect(screen.queryByText("Code: 5h")).not.toBeInTheDocument();
    expect(screen.queryByText("Code: Weekly")).not.toBeInTheDocument();
    expect(screen.getByText("89%")).toBeInTheDocument();
  });

  test("table preview and hover mark depleted codex quotas red", async () => {
    useTableFilesView();
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
    window.localStorage.setItem(
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
      const raw = window.localStorage.getItem(AUTH_FILES_DATA_CACHE_KEY);
      expect(raw).toContain('"planType":"plus"');
    });
  });

  test("cards view uses current auth-file plan badge instead of stale cached quota plan", async () => {
    const now = Date.now();
    const currentFile = {
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

    mocks.list.mockImplementation(async () => ({ files: [currentFile] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [currentFile],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "plus",
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
    expect(screen.getByText("Plan Free")).toBeInTheDocument();
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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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
    window.localStorage.setItem(
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
