import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.CHALLENGE_E2E_ORIGIN ?? 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
  },
  ...(process.env.CHALLENGE_E2E_ORIGIN
    ? {}
    : {
        webServer: {
          command: 'npm --workspace @argus-challenge/web run dev -- --host 127.0.0.1',
          url: 'http://127.0.0.1:5174',
          reuseExistingServer: !process.env.CI,
          env: {
            VITE_OAUTH_GOOGLE_CLIENT_ID:
              process.env.VITE_OAUTH_GOOGLE_CLIENT_ID ?? 'playwright-google-client',
          },
        },
      }),
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } },
  ],
});
