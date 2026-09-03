import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

/** Repo root, resolved from this module: works from src/ (tsx) and dist/ (bundle). */
export const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

config({ path: path.join(repoRoot, '.env'), quiet: true })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  DATABASE_PATH: z.string().default('./data/app.sqlite'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = {
  ...parsed.data,
  /** Absolute path to the SQLite file (":memory:" is passed through untouched). */
  databaseFile:
    parsed.data.DATABASE_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(repoRoot, parsed.data.DATABASE_PATH),
}
