const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 7000 },
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      // Custom headless binaries in CI may not have a hardware GPU. Software
      // compositing avoids stale SwiftShader surfaces across mobile contexts.
      args: ["--font-render-hinting=none", "--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--disable-gpu"]
    } : {}
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30000
  }
});
