import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { env } from '../env.js'
import { runMigrations } from './migrate.js'

export type Db = Database.Database

/**
 * Opens a SQLite database and applies the pragmas we want everywhere:
 * WAL for concurrent readers, enforced foreign keys, and a busy timeout so
 * concurrent writers wait instead of throwing SQLITE_BUSY.
 */
export function openDatabase(file: string = env.databaseFile): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true })
  }

  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  return db
}

/** Opens a database and brings its schema up to date. Used by the app and by tests. */
export function createDatabase(file?: string): Db {
  const db = openDatabase(file)
  runMigrations(db)
  return db
}

let instance: Db | undefined

/** Process-wide connection. better-sqlite3 is synchronous, so one connection is enough. */
export function getDb(): Db {
  instance ??= createDatabase()
  return instance
}

export function closeDb(): void {
  instance?.close()
  instance = undefined
}
