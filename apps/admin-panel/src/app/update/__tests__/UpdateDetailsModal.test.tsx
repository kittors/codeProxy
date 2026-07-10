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

  test("renders updater-provided stage, exact step progress, and hides raw logs", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          run_id: 12,
          event_id: 3,
          status: "running",
          stage: "pulling",
          message_code: "pulling_target_image",
          message: "pulling target image",
          progress_percent: 20,
          progress_current: 1,
          progress_total: 5,
          logs: [
            {
              timestamp: "2026-04-20T07:30:01Z",
              stream: "stdout",
              message: "pull image",
            },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Pulling the target image.")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Completed steps: 1 / 5",
    );
    expect(screen.queryByText("pull image")).toBeNull();
    expect(screen.queryByTestId("update-log-stream")).toBeNull();
  });

  test("uses an indeterminate state instead of manufacturing a percentage", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          run_id: 12,
          event_id: 1,
          status: "running",
          stage: "preparing",
          message_code: "preparing_deployment",
          message: "preparing deployment configuration",
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("Preparing the deployment configuration.")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).toBeNull();
  });

  test("shows release and version metadata delivered by updater events", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          run_id: 12,
          event_id: 4,
          status: "running",
          stage: "recreating",
          message_code: "recreating_service",
          message: "recreating service container and waiting for health",
          progress_percent: 60,
          progress_current: 3,
          progress_total: 5,
          current_version: "main-1111111",
          target_version: "main-2222222",
          current_ui_version: "panel-main-1111111",
          target_ui_version: "panel-main-3333333",
          release_name: "CliRelay v0.5.0",
          release_tag: "v0.5.0",
          release_notes: "Latest updater-delivered changes",
          release_published_at: "2026-07-10T07:30:00Z",
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("update-progress-console")).toHaveTextContent("main-2222222");
    expect(screen.getByTestId("update-progress-console")).toHaveTextContent("panel-main-3333333");
    expect(await screen.findByTestId("update-release-notes")).toHaveTextContent(
      "Latest updater-delivered changes",
    );
    expect(screen.getByTestId("update-release-meta")).toHaveTextContent("CliRelay v0.5.0");
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

  test("shows updater token configuration warning when health reports a missing token", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={{
          ...candidate,
          updater_available: false,
          updater_health_status: "token_missing",
          updater_health_message: "updater token is not configured",
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/updater token is not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/CLIRELAY_UPDATER_TOKEN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update now/i })).toBeDisabled();
  });

  test("blocks updates until a legacy updater sidecar is recreated", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={{
          ...candidate,
          updater_available: false,
          updater_health_status: "upgrade_required",
          updater_health_message: "legacy updater",
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/does not support the SSE update protocol/i)).toBeInTheDocument();
    expect(screen.getByText(/force-recreate clirelay-updater/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update now/i })).toBeDisabled();
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
          message_code: "completed",
          message: "update completed",
          progress_percent: 100,
          progress_current: 5,
          progress_total: 5,
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

  test("shows the release notes section that matches the active language", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={{
          ...candidate,
          release_notes: [
            "v0.4.0 - dev 全量合并发布 / Full dev-to-main release",
            "",
            "中文",
            "",
            "这是中文更新说明。",
            "",
            "English",
            "",
            "This is the English release note.",
          ].join("\n"),
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    const releaseNotes = await screen.findByTestId("update-release-notes");
    expect(releaseNotes).toHaveTextContent("v0.4.0 - Full dev-to-main release");
    expect(releaseNotes).toHaveTextContent("This is the English release note.");
    expect(releaseNotes).not.toHaveTextContent("中文");
    expect(releaseNotes).not.toHaveTextContent("这是中文更新说明。");
  });
});
