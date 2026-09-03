// Migrations are plain .sql files, so the bundler does not pick them up.
// Copy them next to the built bundle; src/db/migrate.ts resolves them relative to itself.
import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const from = fileURLToPath(new URL('src/db/migrations', root))
const to = fileURLToPath(new URL('dist/migrations', root))

mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log(`copied migrations -> ${to}`)
