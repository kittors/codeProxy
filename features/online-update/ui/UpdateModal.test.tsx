import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type {
  UpdateCheckResponse,
  UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";
import { UpdateModal } from "./UpdateModal";

const candidate: UpdateCheckResponse = {
  enabled: true,
  update_available: true,
  updater_available: true,
  current_version: "main-1111111",
  current_commit: "1111111",
  current_ui_version: "panel-main-1111111",
  current_ui_commit: "1111111",
  latest_version: "main-abcdef1",
  latest_commit: "abcdef123456",
  latest_ui_version: "panel-main-fedcba9",
  latest_ui_commit: "fedcba987654",
  target_channel: "main",
  docker_image: "ghcr.io/kittors/clirelay",
  docker_tag: "latest",
  release_notes: "Fixes and improvements",
};

const runningProgress = (
  overrides: Partial<UpdateProgressResponse> = {},
): UpdateProgressResponse => ({
  status: "running",
  run_id: 1,
  event_id: 2,
  stage: "pulling",
  message_code: "pulling_target_image",
  progress_percent: 37,
  progress_bytes: 3_700_000,
  progress_total_bytes: 10_000_000,
  stages: [
    { id: "pulling", state: "active" },
    { id: "application", state: "pending" },
  ],
  logs: [{ message: "Downloading layer", stream: "stdout", timestamp: "2026-07-28T00:00:00Z" }],
  ...overrides,
});

const noop = () => {};

describe("UpdateModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows the version change as a from/to pair", () => {
    render(<UpdateModal open candidate={candidate} onApply={noop} onClose={noop} />);

    expect(screen.getByText("main-1111111")).toBeTruthy();
    expect(screen.getByText("main-abcdef1")).toBeTruthy();
    expect(screen.getByTestId("update-image-value").textContent).toBe(
      "ghcr.io/kittors/clirelay:latest",
    );
  });

  /**
   * The regression this pins: a reported 0% used to be dropped from the payload,
   * read as "no progress reporting", and rendered as a *full* bar at the very moment
   * an update started — the most misleading thing the old modal did.
   */
  test("renders an empty bar at zero percent, not a full one", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress({ progress_percent: 0 })}
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByTestId("update-progress-fill").getAttribute("style")).toContain("width: 0%");
    expect(screen.getByTestId("update-progress-percent").textContent).toBe("0%");
  });

  test("renders the reported percentage and transferred bytes", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress()}
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByTestId("update-progress-percent").textContent).toBe("37%");
    expect(screen.getByTestId("update-progress-fill").getAttribute("style")).toContain("width: 37%");
    expect(screen.getByTestId("update-progress-bytes").textContent).toBe("3.7MB / 10.0MB");
  });

  /**
   * An older updater reports progress_current/progress_total but no stage timeline.
   * Those deployments must still get step context rather than a bare percentage.
   */
  test("falls back to step counts when the updater sends no stage timeline", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress({ stages: undefined, progress_current: 3, progress_total: 5 })}
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByTestId("update-progress-details").textContent).toContain("3");
    expect(screen.queryByTestId("update-stage-timeline")).toBeNull();
  });

  test("renders the stage timeline reported by the updater", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress()}
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByTestId("update-stage-timeline").children.length).toBe(2);
  });

  /**
   * The stream always drops when the application container is recreated. Saying so
   * is the difference between "it is restarting" and "it has hung".
   */
  test("explains the reconnect while the application container restarts", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress()}
        link="reconnecting"
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByTestId("update-reconnecting")).toBeTruthy();
  });

  test("does not claim a reconnect while events are flowing", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress()}
        link="live"
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.queryByTestId("update-reconnecting")).toBeNull();
  });

  test("offers a page reload once the update completes", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress({ status: "completed", progress_percent: 100 })}
        completed
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText(i18n.t("auto_update.refresh_page"))).toBeTruthy();
  });

  /** Closing mid-update would hide an operation the user cannot cancel. */
  test("keeps the close action disabled while updating", () => {
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress()}
        updating
        onApply={noop}
        onClose={noop}
      />,
    );

    const close = screen.getByText(i18n.t("common.close")).closest("button");
    expect(close?.hasAttribute("disabled")).toBe(true);
  });

  test("offers a retry after a failed run", () => {
    const onApply = vi.fn();
    render(
      <UpdateModal
        open
        candidate={candidate}
        progress={runningProgress({ status: "failed", stage: "failed" })}
        failed
        onApply={onApply}
        onClose={noop}
      />,
    );

    expect(screen.getByText(i18n.t("auto_update.update_now"))).toBeTruthy();
  });

  test("explains why the updater cannot be reached", () => {
    render(
      <UpdateModal
        open
        candidate={{
          ...candidate,
          updater_available: false,
          updater_health_status: "token_missing",
        }}
        onApply={noop}
        onClose={noop}
      />,
    );

    expect(screen.getByText(i18n.t("auto_update.updater_token_missing"))).toBeTruthy();
  });
});
