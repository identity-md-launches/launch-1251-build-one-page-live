import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test/scratch/playwright-results',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174/preview/',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-export.mjs',
    env: { PORT: '4174' },
    url: 'http://127.0.0.1:4174/preview/',
    reuseExistingServer: false,
  },
});
