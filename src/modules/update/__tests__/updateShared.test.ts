import { beforeEach, describe, expect, test, vi } from "vitest";
import { applyUpdateFlow, formatUpdateStatusMessage } from "@/modules/update/updateShared";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apply: vi.fn(),
  current: vi.fn(),
  progress: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
  },
}));

vi.mock("@/lib/http/apis/update", () => ({
  updateApi: {
    apply: mocks.apply,
    current: mocks.current,
    progress: mocks.progress,
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

describe("applyUpdateFlow", () => {
  beforeEach(() => {
    mocks.apiGet.mockResolvedValue({ uptime: 10 });
    mocks.apply.mockResolvedValue({ status: "accepted" });
    mocks.current.mockResolvedValue({
      enabled: true,
      update_available: true,
      current_version: "main-a0ed5c6",
      current_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
      current_ui_version: "panel-main-1111111",
      current_ui_commit: "1111111",
      latest_version: "main-a0ed5c6",
      latest_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
      latest_ui_version: "panel-main-9477958",
      latest_ui_commit: "94779588adb784b1ceff19c662d3ab55155997e1",
      target_channel: "main",
      docker_image: "ghcr.io/kittors/clirelay",
      docker_tag: "latest",
      updater_available: true,
    });
    mocks.progress.mockResolvedValue({
      status: "completed",
      stage: "completed",
      message: "update completed",
    });
  });

  test("treats completed frontend-only updates as successful before the page reload sees the new UI commit", async () => {
    const notify = vi.fn();
    const onSuccess = vi.fn();

    const result = await applyUpdateFlow({
      candidate: {
        enabled: true,
        update_available: true,
        current_version: "main-a0ed5c6",
        current_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
        current_ui_version: "panel-main-1111111",
        current_ui_commit: "1111111",
        latest_version: "main-a0ed5c6",
        latest_commit: "a0ed5c63a118412d5b4da8d57ec6d049111b7888",
        latest_ui_version: "panel-main-9477958",
        latest_ui_commit: "94779588adb784b1ceff19c662d3ab55155997e1",
        target_channel: "main",
        docker_image: "ghcr.io/kittors/clirelay",
        docker_tag: "latest",
        updater_available: true,
      },
      heartbeatIntervalMs: 1,
      heartbeatTimeoutMs: 20,
      notify,
      onSuccess,
      t: ((key: string) => key) as never,
    });

    expect(result).toBe(true);
    expect(notify).toHaveBeenCalledWith({
      type: "success",
      message: "auto_update.success",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
