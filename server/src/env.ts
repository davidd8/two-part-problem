import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

/** Repo root, resolved from this module: works from src/ (tsx) and dist/ (bundle). */
export const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

config({ path: path.join(repoRoot, '.env'), quiet: true })

/**
 * Ports for a clone with PORT_OFFSET=0. Everything else is derived by adding
 * the offset, so a second clone moves its whole block out of the way at once.
 * Blocks are 10 wide: an offset of 1 would land the dev API on the e2e port.
 */
export const BASE_PORTS = { api: 3001, web: 5173, e2eApi: 3002, e2eWeb: 5174 } as const

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT_OFFSET: z.coerce.number().int().min(0).multipleOf(10).default(0),
  /** Set directly only to pin one process (the e2e runner does); otherwise derived. */
  PORT: z.coerce.number().int().min(0).max(65535).optional(),
  DATABASE_PATH: z.string().default('./data/app.sqlite'),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = {
  ...parsed.data,
  PORT: parsed.data.PORT ?? BASE_PORTS.api + parsed.data.PORT_OFFSET,
  /** Absolute path to the SQLite file (":memory:" is passed through untouched). */
  databaseFile:
    parsed.data.DATABASE_PATH === ':memory:'
      ? ':memory:'
      : path.resolve(repoRoot, parsed.data.DATABASE_PATH),
}
