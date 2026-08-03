/* End-to-end, against the real Worker.
   `wrangler dev` serves the actual site and the actual API, so these tests
   exercise the same code that gets deployed — not a dev server standing in
   for it. Mobile first: most people order dinner from a phone. */

import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The site picks its language from the browser and its prices from the
    // locale. Pinning both means a test asserts "17,10 €" because that is what
    // a guest in Hockenheim sees — not because of whatever the CI box is set to.
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin'
  },

  projects: [
    // A phone is the primary target, so it runs first and its failures are
    // the ones read first.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },

    // iPhone matters — it is most of the traffic a restaurant sees — but
    // Playwright's WebKit build hangs on clicks on Windows hosts, which is a
    // problem with the browser build and not with the site. So it runs on
    // Linux (that is, in CI) and is skipped on a Windows desktop, where it
    // would only ever produce false failures.
    ...(process.platform === 'win32'
      ? []
      : [{ name: 'mobile-safari', use: { ...devices['iPhone 14'] } }])
  ],

  webServer: {
    // --persist-to matters: assets.directory is the repo root, so wrangler's
    // default .wrangler state lands inside the directory it is watching and
    // the dev server reloads in a loop until the runtime gives up.
    command: `npx wrangler dev --port ${PORT} --local --persist-to ../.kairo1980-dev-state`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
