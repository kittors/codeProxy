import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "bun run dev -- --host 127.0.0.1 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
});
