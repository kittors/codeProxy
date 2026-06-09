import { render, screen } from "@testing-library/react";
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

  test("localizes common updater messages, shows percentage, and hides live docker logs", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "running",
          stage: "pulling",
          message: "pulling target image",
          logs: [{ timestamp: "2026-04-20T07:30:01Z", stream: "stdout", message: "pull image" }],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Pulling the target image.")).toBeInTheDocument();
    expect(screen.getByText(/1[89]%|20%/)).toBeInTheDocument();
    expect(screen.queryByText("pull image")).toBeNull();
    expect(screen.queryByTestId("update-log-stream")).toBeNull();
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

  test("replaces footer close action with reload when update is completed", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "completed",
          stage: "completed",
          message: "update completed",
          logs: [
            {
              timestamp: "2026-04-20T07:30:05Z",
              stream: "stderr",
              message: "Container clirelay Started",
            },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("heading", { name: /update completed/i })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /updating/i })).toBeNull();
    expect(screen.queryByText("Close")).toBeNull();
    expect(screen.getByRole("button", { name: /refresh page/i })).toBeEnabled();
    expect(screen.queryByTestId("update-log-stream")).toBeNull();
    expect(screen.getByTestId("update-details-modal-body")).toHaveClass("max-h-[min(62vh,520px)]");
  });
});
