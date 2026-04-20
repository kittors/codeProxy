import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import i18n from "@/i18n";
import { UpdateDetailsModal } from "@/modules/update/UpdateDetailsModal";

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
    await i18n.changeLanguage("en");
  });

  test("auto-scrolls the update log stream to the latest line", async () => {
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
          logs: [{ timestamp: "2026-04-20T07:30:01Z", stream: "stdout", message: "pull image" }],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    const stream = await screen.findByTestId("update-log-stream");
    expect(stream.scrollTop).toBe(400);

    scrollHeight = 960;
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
              timestamp: "2026-04-20T07:30:05Z",
              stream: "stderr",
              message: "container started",
            },
          ],
        }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByTestId("update-log-stream")).toHaveProperty("scrollTop", 960);
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
