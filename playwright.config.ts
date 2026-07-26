import { defineConfig, devices } from "@playwright/test";

// Each run gets its own dev server on its own port. Reusing whatever already
// listens on a fixed port silently binds the suite to another checkout's server
// (or a stale one from a killed run), which shows up as a wall of "locator.fill
// timeout" failures that look like real regressions.
//
// The port is derived once and exported back into the environment: Playwright
// re-evaluates this config in worker processes, so deriving it from the current
// pid there would disagree with the port the web server was started on.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 0) || 5173 + (process.pid % 1000);
process.env.PLAYWRIGHT_PORT = String(port);
const baseURL = `http://127.0.0.1:${port}`;

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  },
];

if (process.env.PLAYWRIGHT_BROWSER_MATRIX === "1") {
  projects.push(
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    // Never adopt a server this run did not start, locally or in CI.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects,
});
