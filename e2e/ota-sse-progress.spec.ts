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
  latest_ui_commit_url:
    "https://github.com/kittors/codeProxy/commit/444444444444",
  docker_image: "ghcr.io/kittors/clirelay",
  docker_tag: "latest",
  release_name: "CliRelay v0.5.0",
  release_tag: "v0.5.0",
  release_notes:
    "English\n\n- SSE progress comes from updater\n- SQLite is manual-only",
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

test("OTA modal renders updater SSE progress and release metadata", async ({
  page,
}) => {
  await setAuthed(page);
  await page.addInitScript((progressTarget) => {
    const originalFetch = window.fetch.bind(window);
    let updateStarted = false;
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.href,
      );
      if (url.pathname.endsWith("/update/apply")) {
        updateStarted = true;
        return originalFetch(input, init);
      }
      if (!url.pathname.endsWith("/update/events"))
        return originalFetch(input, init);

      const encoder = new TextEncoder();
      let timer = 0;
      let runningSentAt = 0;
      const eventBody = (completed: boolean) => ({
        run_id: completed ? 41 : updateStarted ? 41 : 0,
        event_id: completed ? 2 : updateStarted ? 1 : 0,
        status: completed ? "completed" : updateStarted ? "running" : "idle",
        stage: completed ? "completed" : updateStarted ? "recreating" : "idle",
        message_code: completed
          ? "completed"
          : updateStarted
            ? "recreating_service"
            : "idle",
        message: completed
          ? "update completed"
          : updateStarted
            ? "recreating service container and waiting for health"
            : "idle",
        progress_percent: completed ? 100 : updateStarted ? 60 : 0,
        progress_current: completed ? 5 : updateStarted ? 3 : 0,
        progress_total: 5,
        current_version: progressTarget.current_version,
        current_commit: progressTarget.current_commit,
        current_ui_version: progressTarget.current_ui_version,
        current_ui_commit: progressTarget.current_ui_commit,
        target_version: progressTarget.latest_version,
        target_commit: progressTarget.latest_commit,
        target_commit_url: progressTarget.latest_commit_url,
        target_ui_version: progressTarget.latest_ui_version,
        target_ui_commit: progressTarget.latest_ui_commit,
        target_ui_commit_url: progressTarget.latest_ui_commit_url,
        target_channel: progressTarget.target_channel,
        target_image: progressTarget.docker_image,
        target_tag: progressTarget.docker_tag,
        release_name: progressTarget.release_name,
        release_tag: progressTarget.release_tag,
        release_notes: progressTarget.release_notes,
        release_url: progressTarget.release_url,
        release_published_at: progressTarget.release_published_at,
      });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const emit = (payload: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(
                `event: update\ndata: ${JSON.stringify(payload)}\n\n`,
              ),
            );
          };
          emit(eventBody(false));
          timer = window.setInterval(() => {
            if (!updateStarted) return;
            if (runningSentAt === 0) {
              runningSentAt = Date.now();
              emit(eventBody(false));
              return;
            }
            if (Date.now() - runningSentAt < 300) return;
            window.clearInterval(timer);
            emit(eventBody(true));
            controller.close();
          }, 40);
        },
        cancel() {
          window.clearInterval(timer);
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    };
  }, target);

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
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ status: "accepted", run_id: 41, target }),
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
  await page
    .getByRole("button", { name: /Check Docker Update|检查 Docker 更新/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /New Version Found|发现新版本/i }),
  ).toBeVisible();
  await expect(page.getByTestId("update-release-notes")).toContainText(
    "SSE progress comes from updater",
  );

  await page.getByRole("button", { name: /Update now|立即更新/i }).click();
  await expect(page.getByTestId("update-progress-console")).toHaveCount(1);
  await expect(page.getByTestId("update-progress-console")).toContainText(
    "Completed steps: 3 / 5",
  );
  await expect(page.getByTestId("update-progress-console")).toContainText(
    "60%",
  );
  await expect(page.getByTestId("update-release-meta")).toContainText(
    "CliRelay v0.5.0",
  );
  await expect(page.getByTestId("update-progress-console")).not.toContainText(
    /SQLite/i,
  );
  if (process.env.CAPTURE_OTA_SCREENSHOT === "1") {
    await page.screenshot({
      path: "output/playwright/ota-sse-progress-running.png",
      fullPage: true,
    });
  }

  await expect(
    page.getByRole("heading", { name: /Update completed|更新完成/i }),
  ).toBeVisible();
  await expect(page.getByTestId("update-progress-console")).toContainText(
    "100%",
  );
});
