import type { Db } from './index.js'

const SEED_TASKS = [
  { title: 'Read the README', notes: 'Start here for the layout of the project.', done: 1 },
  { title: 'Add a migration', notes: 'Drop a new .sql file in server/src/db/migrations.', done: 0 },
  { title: 'Build a feature', notes: null, done: 0 },
]

/** Inserts demo rows. Idempotent: does nothing if the table already has data. */
export function seed(db: Db): number {
  const { count } = db
    .prepare<[], { count: number }>('SELECT count(*) AS count FROM tasks')
    .get() as {
    count: number
  }
  if (count > 0) return 0

  const insert = db.prepare<{ title: string; notes: string | null; done: number }>(
    'INSERT INTO tasks (title, notes, done) VALUES (:title, :notes, :done)',
  )
  db.transaction(() => {
    for (const task of SEED_TASKS) insert.run(task)
  })()

  return SEED_TASKS.length
}
