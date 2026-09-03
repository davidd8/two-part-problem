import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { runMigrations } from '../db/migrate.js'

describe('runMigrations', () => {
  it('applies migrations once and is safe to re-run', () => {
    const db = openDatabase(':memory:')

    const first = runMigrations(db)
    expect(first).toContain('0001_init.sql')

    const second = runMigrations(db)
    expect(second).toEqual([])

    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name)
    expect(tables).toContain('tasks')

    db.close()
  })
})
