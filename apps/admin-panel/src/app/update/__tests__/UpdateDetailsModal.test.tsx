import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { UpdateDetailsModal } from "@app/update/UpdateDetailsModal";

const candidate = {
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
} as const;

describe("UpdateDetailsModal", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("paces update log rendering at 30fps and auto-scrolls each visible frame", async () => {
    vi.useFakeTimers();
    let frameTime = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => {
        frameTime += 34;
        callback(frameTime);
      }, 34),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      window.clearTimeout(id);
    });

    let scrollHeight = 400;
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return scrollHeight;
      },
    });

    const { rerender } = render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "running",
          stage: "pulling",
          logs: [
            { timestamp: "2026-04-20T07:30:01Z", stream: "stdout", message: "pull image" },
            {
              timestamp: "2026-04-20T07:30:02Z",
              stream: "stdout",
              message: "extract layer",
            },
            {
              timestamp: "2026-04-20T07:30:03Z",
              stream: "stderr",
              message: "container started",
            },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    const stream = screen.getByTestId("update-log-stream");
    expect(screen.getByText("pull image")).toBeInTheDocument();
    expect(screen.queryByText("extract layer")).not.toBeInTheDocument();
    expect(screen.queryByText("container started")).not.toBeInTheDocument();
    expect(stream.scrollTop).toBe(400);

    scrollHeight = 960;
    await act(async () => {
      vi.advanceTimersByTime(34);
    });
    expect(screen.getByText("extract layer")).toBeInTheDocument();
    expect(screen.queryByText("container started")).not.toBeInTheDocument();
    expect(stream.scrollTop).toBe(960);

    scrollHeight = 1280;
    await act(async () => {
      vi.advanceTimersByTime(34);
    });
    expect(screen.getByText("container started")).toBeInTheDocument();
    expect(stream.scrollTop).toBe(1280);

    scrollHeight = 1600;
    rerender(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "running",
          stage: "restarting",
          logs: [
            { timestamp: "2026-04-20T07:30:01Z", stream: "stdout", message: "pull image" },
            {
              timestamp: "2026-04-20T07:30:02Z",
              stream: "stdout",
              message: "extract layer",
            },
            {
              timestamp: "2026-04-20T07:30:03Z",
              stream: "stderr",
              message: "container started",
            },
            { timestamp: "2026-04-20T07:30:04Z", stream: "stdout", message: "verify service" },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByText("verify service")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(34);
    });
    expect(screen.getByText("verify service")).toBeInTheDocument();
    expect(screen.getByTestId("update-log-stream")).toHaveProperty("scrollTop", 1600);
  });

  test("renders localized success styling when already up to date", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={{
          ...candidate,
          update_available: false,
          latest_version: candidate.current_version,
          latest_commit: candidate.current_commit,
          latest_ui_version: candidate.current_ui_version,
          latest_ui_commit: candidate.current_ui_commit,
          message: "already up to date",
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: /already updated to latest/i })).toBeInTheDocument();
    expect(screen.queryByText("already up to date")).not.toBeInTheDocument();
    expect(
      screen.getByText(/already updated to latest/i, {
        selector: "p.rounded-xl",
      }),
    ).toHaveClass("text-emerald-800");
  });
});
