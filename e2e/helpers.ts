import { execFileSync } from 'node:child_process'
import { E2E_DATABASE_PATH } from '../playwright.config.js'

/**
 * Drops and reseeds the e2e database between tests.
 *
 * Runs the same `db:reset` a developer runs, pointed at the e2e file. The reset
 * recreates tables in place rather than deleting the file, so the API server
 * holding the database open keeps working across it.
 */
export function resetDatabase(): void {
  execFileSync('npm', ['run', 'db:reset'], {
    env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH },
    stdio: 'pipe',
  })
}

/** Titles of the rows inserted by server/src/db/seed.ts. */
export const SEEDED_TITLES = ['Read the README', 'Add a migration', 'Build a feature']
