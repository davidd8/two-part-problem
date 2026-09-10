import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs the real stack — Vite, the Express API, and a real SQLite file —
 * on its own ports and its own database, so it never collides with or
 * clobbers a `npm run dev` session on 5173/3001 — or another clone's, when
 * PORT_OFFSET is set.
 */
// PORT_OFFSET in the root .env moves this clone's whole block of ports, so a
// second clone can run its own e2e at the same time. See server/src/env.ts.
loadDotenv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true })
const PORT_OFFSET = Number(process.env.PORT_OFFSET ?? 0)

const API_PORT = 3002 + PORT_OFFSET
const WEB_PORT = 5174 + PORT_OFFSET

export const E2E_DATABASE_PATH = './data/e2e.sqlite'

export default defineConfig({
  testDir: './e2e',

  // One worker against one SQLite file: tests share a database, so they run
  // in order and each resets it first.
  fullyParallel: false,
  workers: 1,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run dev -w server',
      url: `http://localhost:${API_PORT}/api/health`,
      env: { PORT: String(API_PORT), DATABASE_PATH: E2E_DATABASE_PATH },
      reuseExistingServer: true,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // vite.config.ts reads API_TARGET, so the proxy points at the e2e API.
      command: `npm run dev -w client -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: true,
    },
  ],
})
