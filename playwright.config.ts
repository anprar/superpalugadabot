import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  use: {
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  }
});
