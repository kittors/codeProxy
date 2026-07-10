import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyUpdateFlow,
  formatUpdateStatusMessage,
  selectLocalizedReleaseNotes,
} from "@app/update/updateShared";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apply: vi.fn(),
  current: vi.fn(),
  progress: vi.fn(),
  events: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock("@code-proxy/api-client/endpoints/update", () => ({
  updateApi: {
    apply: mocks.apply,
    current: mocks.current,
    progress: mocks.progress,
    events: mocks.events,
  },
}));

describe("formatUpdateStatusMessage", () => {
  test("splits degraded update status clauses onto separate lines", () => {
    const message =
      'service update check degraded: github commit status 403: {"message":"API rate limit exceeded"}; management UI update check degraded: github commit status 403: {"message":"API rate limit exceeded"}';

    expect(formatUpdateStatusMessage(message)).toBe(
      'service update check degraded: github commit status 403: {"message":"API rate limit exceeded"};\nmanagement UI update check degraded: github commit status 403: {"message":"API rate limit exceeded"}',
    );
  });

  test("keeps ordinary status messages unchanged", () => {
    expect(formatUpdateStatusMessage("already up to date")).toBe("already up to date");
  });
});

describe("selectLocalizedReleaseNotes", () => {
  const bilingualNotes = [
    "v0.4.0 - dev 全量合并发布 / Full dev-to-main release",
    "",
    "中文",
    "",
    "这是中文更新说明。",
    "",
    "- 后端架构整理",
    "",
    "English",
    "",
    "This is the English release note.",
    "",
    "- Backend architecture cleanup",
  ].join("\n");

  test("selects the English section and localizes the bilingual heading", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "en")).toBe(
      [
        "v0.4.0 - Full dev-to-main release",
        "",
        "This is the English release note.",
        "",
        "- Backend architecture cleanup",
      ].join("\n"),
    );
  });

  test("keeps the Chinese section for Chinese UI", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "zh-CN")).toBe(
      ["v0.4.0 - dev 全量合并发布", "", "这是中文更新说明。", "", "- 后端架构整理"].join("\n"),
    );
  });

  test("falls back to English for locales without a dedicated release section", () => {
    expect(selectLocalizedReleaseNotes(bilingualNotes, "ru")).toContain(
      "This is the English release note.",
    );
  });
});

describe("applyUpdateFlow", () => {
  beforeEach(() => {
    mocks.apply.mockReset();
    mocks.events.mockReset();
    mocks.apply.mockResolvedValue({ status: "accepted", run_id: 42 });
    mocks.events.mockImplementation(
      async (onProgress: (progress: Record<string, unknown>) => void) => {
        onProgress({
          run_id: 42,
          event_id: 5,
          status: "running",
          stage: "verifying",
          message_code: "service_healthy",
          message: "updated service container is running and healthy",
          progress_percent: 100,
          progress_current: 5,
          progress_total: 5,
        });
        onProgress({
          run_id: 42,
          event_id: 6,
          status: "completed",
          stage: "completed",
          message_code: "completed",
          message: "update completed",
          progress_percent: 100,
          progress_current: 5,
          progress_total: 5,
        });
      },
    );
  });

  test("reports only updater SSE progress and completes the accepted run", async () => {
    const notify = vi.fn();
    const onProgress = vi.fn();
    const result = await applyUpdateFlow({
      candidate: {
        enabled: true,
        update_available: true,
        updater_available: true,
      },
      heartbeatIntervalMs: 1,
      heartbeatTimeoutMs: 1000,
      notify,
      onProgress,
      t: ((key: string) => key) as never,
    });

    expect(result).toBe(true);
    expect(mocks.events).toHaveBeenCalled();
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual([
      "verifying",
      "completed",
    ]);
    expect(notify).toHaveBeenCalledWith({ type: "success", message: "auto_update.success" });
  });
});
