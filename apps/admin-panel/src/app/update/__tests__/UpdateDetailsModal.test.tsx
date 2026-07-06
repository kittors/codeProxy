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
    expect(screen.getByText(/1[89]%|20%/)).toBeInTheDocument();
    expect(screen.queryByText("pull image")).toBeNull();
    expect(screen.queryByTestId("update-log-stream")).toBeNull();
  });

  test("shows structured SQLite migration progress details", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "running",
          stage: "migrating",
          message: "migrating legacy SQLite data before restarting service",
          progress_percent: 86,
          migration: {
            phase: "applying",
            target_database: "PostgreSQL",
            table: "request_logs",
            table_index: 16,
            table_total: 17,
            inserted_rows: 2,
            target_rows: 167648,
          },
          logs: [
            {
              timestamp: "2026-07-06T08:32:01Z",
              stream: "stderr",
              message: "sqlite import progress: table 16/17 request_logs",
            },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText(
        "Migrating legacy SQLite data before restarting the service.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Data migration check")).toBeInTheDocument();
    expect(screen.getByText("86%")).toBeInTheDocument();
    expect(screen.getByTestId("update-progress-percent")).toHaveStyle({
      left: "clamp(1.5rem, 86%, calc(100% - 1.5rem))",
    });
    expect(screen.getByTestId("update-progress-fill")).toHaveStyle({
      width: "86%",
    });
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Target: PostgreSQL",
    );
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Phase: importing rows",
    );
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Table: 16/17 request_logs",
    );
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Rows: 2 / 167,648",
    );
    expect(
      screen.queryByText("sqlite import progress: table 16/17 request_logs"),
    ).toBeNull();
  });

  test("shows skipped SQLite migration as a check instead of active migration", async () => {
    render(
      <UpdateDetailsModal
        open
        candidate={candidate}
        updateTarget={candidate}
        updating
        progress={{
          status: "running",
          stage: "migrating",
          message:
            "no legacy SQLite database found; continuing with PostgreSQL runtime data",
          progress_percent: 88,
          migration: {
            phase: "skipped",
            target_database: "PostgreSQL",
            skip_reason: "no_legacy_sqlite",
          },
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText(
        "No legacy SQLite database was found; continuing with the PostgreSQL runtime data.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Data migration check")).toBeInTheDocument();
    expect(screen.getByTestId("update-progress-details")).toHaveTextContent(
      "Phase: skipped",
    );
    expect(screen.queryByText(/Migrating legacy SQLite data/)).toBeNull();
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

    expect(
      screen.getByRole("heading", { name: /already updated to latest/i }),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(/updater token is not configured/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/CLIRELAY_UPDATER_TOKEN/)).toBeInTheDocument();
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

    expect(
      screen.getByRole("heading", { name: /update completed/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /updating/i })).toBeNull();
    expect(screen.queryByText("Close")).toBeNull();
    expect(screen.getByRole("button", { name: /refresh page/i })).toBeEnabled();
    expect(screen.queryByTestId("update-log-stream")).toBeNull();
    expect(screen.getByTestId("update-details-modal-body")).toHaveClass(
      "max-h-[min(62vh,520px)]",
    );
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
