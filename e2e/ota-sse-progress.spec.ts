import { expect, test, type Page } from "@playwright/test";

const target = {
  enabled: true,
  current_version: "main-1111111",
  current_commit: "111111111111",
  current_ui_version: "panel-main-2222222",
  current_ui_commit: "222222222222",
  target_channel: "main",
  latest_version: "main-3333333",
  latest_commit: "333333333333",
  latest_commit_url: "https://github.com/kittors/CliRelay/commit/333333333333",
  latest_ui_version: "panel-main-4444444",
  latest_ui_commit: "444444444444",
  latest_ui_commit_url: "https://github.com/kittors/codeProxy/commit/444444444444",
  docker_image: "ghcr.io/kittors/clirelay",
  docker_tag: "latest",
  release_name: "CliRelay v0.5.0",
  release_tag: "v0.5.0",
  release_notes: "English\n\n- SSE progress comes from updater\n- SQLite is manual-only",
  release_url: "https://github.com/kittors/CliRelay/releases/tag/v0.5.0",
  release_published_at: "2026-07-10T07:30:00Z",
  update_available: true,
  updater_available: true,
  updater_health_status: "ok",
};

const setAuthed = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  });
};

test("OTA modal renders updater SSE progress and release metadata", async ({ page }) => {
  await setAuthed(page);
  let updateStarted = false;
  let eventRequestsAfterStart = 0;

  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/update/check")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(target),
      });
      return;
    }

    if (path.endsWith("/update/apply")) {
      updateStarted = true;
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ status: "accepted", run_id: 41, target }),
      });
      return;
    }

    if (path.endsWith("/update/events")) {
      let progress: Record<string, unknown> = { status: "idle", stage: "idle" };
      if (updateStarted) {
        eventRequestsAfterStart += 1;
        progress = {
          run_id: 41,
          event_id: eventRequestsAfterStart,
          status: eventRequestsAfterStart >= 5 ? "completed" : "running",
          stage: eventRequestsAfterStart >= 5 ? "completed" : "recreating",
          message_code: eventRequestsAfterStart >= 5 ? "completed" : "recreating_service",
          message:
            eventRequestsAfterStart >= 5
              ? "update completed"
              : "recreating service container and waiting for health",
          progress_percent: eventRequestsAfterStart >= 5 ? 100 : 60,
          progress_current: eventRequestsAfterStart >= 5 ? 5 : 3,
          progress_total: 5,
          current_version: target.current_version,
          current_commit: target.current_commit,
          current_ui_version: target.current_ui_version,
          current_ui_commit: target.current_ui_commit,
          target_version: target.latest_version,
          target_commit: target.latest_commit,
          target_commit_url: target.latest_commit_url,
          target_ui_version: target.latest_ui_version,
          target_ui_commit: target.latest_ui_commit,
          target_ui_commit_url: target.latest_ui_commit_url,
          target_channel: target.target_channel,
          target_image: target.docker_image,
          target_tag: target.docker_tag,
          release_name: target.release_name,
          release_tag: target.release_tag,
          release_notes: target.release_notes,
          release_url: target.release_url,
          release_published_at: target.release_published_at,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "Cache-Control": "no-cache" },
        body: `event: update\ndata: ${JSON.stringify(progress)}\n\n`,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/system");
  await page.getByRole("button", { name: /Check Docker Update|检查 Docker 更新/i }).click();
  await expect(page.getByRole("heading", { name: /New Version Found|发现新版本/i })).toBeVisible();
  await expect(page.getByTestId("update-release-notes")).toContainText(
    "SSE progress comes from updater",
  );

  await page.getByRole("button", { name: /Update now|立即更新/i }).click();
  await expect(page.getByTestId("update-progress-console")).toHaveCount(1);
  await expect(page.getByTestId("update-progress-console")).toContainText("Completed steps: 3 / 5");
  await expect(page.getByTestId("update-progress-console")).toContainText("60%");
  await expect(page.getByTestId("update-release-meta")).toContainText("CliRelay v0.5.0");
  await expect(page.getByTestId("update-progress-console")).not.toContainText(/SQLite/i);
  if (process.env.CAPTURE_OTA_SCREENSHOT === "1") {
    await page.screenshot({
      path: "output/playwright/ota-sse-progress-running.png",
      fullPage: true,
    });
  }

  await expect(page.getByRole("heading", { name: /Update completed|更新完成/i })).toBeVisible();
  await expect(page.getByTestId("update-progress-console")).toContainText("100%");
});
