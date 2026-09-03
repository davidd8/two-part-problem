import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from './index.js'

/** Resolves to src/db/migrations in dev and dist/migrations in a build. */
const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url))

export interface Migration {
  name: string
  sql: string
}

export function loadMigrations(dir: string = migrationsDir): Migration[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }))
}

/**
 * Applies every migration that has not run yet, each in its own transaction,
 * recording it in the `_migrations` bookkeeping table.
 */
export function runMigrations(db: Db, dir?: string): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const applied = new Set(
    db.prepare<[], { name: string }>('SELECT name FROM _migrations').all().map((row) => row.name),
  )

  const record = db.prepare<[string]>('INSERT INTO _migrations (name) VALUES (?)')
  const ran: string[] = []

  for (const migration of loadMigrations(dir)) {
    if (applied.has(migration.name)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      record.run(migration.name)
    })()
    ran.push(migration.name)
  }

  return ran
}

/**
 * Drops every user-created table and view so migrations can run from scratch.
 * Done in place rather than by deleting the file: a dev server holding this
 * database open would keep writing to the deleted inode and silently lose data.
 */
export function resetSchema(db: Db): void {
  const objects = db
    .prepare<[], { name: string; type: string }>(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'`,
    )
    .all()

  db.pragma('foreign_keys = OFF')
  db.transaction(() => {
    for (const object of objects) {
      const keyword = object.type === 'view' ? 'VIEW' : 'TABLE'
      db.exec(`DROP ${keyword} IF EXISTS "${object.name.replace(/"/g, '""')}"`)
    }
  })()
  db.pragma('foreign_keys = ON')
}
