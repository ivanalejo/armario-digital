import { defineConfig, devices } from '@playwright/test';

// E2E contra el build de producción (con CSP y service worker reales).
// CHROMIUM_PATH permite usar un Chromium ya instalado si no se puede ejecutar `npx playwright install`.
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173/armario-digital/',
    serviceWorkers: 'allow',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox', '--no-zygote'] } : {},
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/armario-digital/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
