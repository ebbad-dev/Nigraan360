import { defineConfig } from "@playwright/test";

// Runs against an already-started stack (API + Vite dev server). Defaults match the
// isolated UAT ports; override with E2E_BASE_URL / E2E_API_URL.
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8090",
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
