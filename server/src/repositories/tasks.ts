import type { CreateTaskInput, ListTasksQuery, Task, UpdateTaskInput } from '@app/shared'
import type { Db } from '../db/index.js'

/** Row shape as stored in SQLite: snake_case columns, 0/1 for booleans. */
interface TaskRow {
  id: number
  title: string
  notes: string | null
  done: number
  created_at: string
  updated_at: string
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    done: row.done === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COLUMNS = 'id, title, notes, done, created_at, updated_at'

export function listTasks(db: Db, query: ListTasksQuery): { items: Task[]; total: number } {
  const where = query.status === 'all' ? '' : `WHERE done = ${query.status === 'done' ? 1 : 0}`

  const rows = db
    .prepare<{ limit: number; offset: number }, TaskRow>(
      `SELECT ${COLUMNS} FROM tasks ${where}
       ORDER BY done ASC, created_at DESC, id DESC
       LIMIT :limit OFFSET :offset`,
    )
    .all({ limit: query.limit, offset: query.offset })

  const { total } = db
    .prepare<[], { total: number }>(`SELECT count(*) AS total FROM tasks ${where}`)
    .get() as { total: number }

  return { items: rows.map(toTask), total }
}

export function getTask(db: Db, id: number): Task | undefined {
  const row = db
    .prepare<{ id: number }, TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE id = :id`)
    .get({ id })
  return row ? toTask(row) : undefined
}

export function createTask(db: Db, input: CreateTaskInput): Task {
  const row = db
    .prepare<{ title: string; notes: string | null }, TaskRow>(
      `INSERT INTO tasks (title, notes) VALUES (:title, :notes) RETURNING ${COLUMNS}`,
    )
    .get({ title: input.title, notes: input.notes ?? null })
  return toTask(row as TaskRow)
}

export function updateTask(db: Db, id: number, input: UpdateTaskInput): Task | undefined {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (input.title !== undefined) {
    sets.push('title = :title')
    params.title = input.title
  }
  if (input.notes !== undefined) {
    sets.push('notes = :notes')
    params.notes = input.notes ?? null
  }
  if (input.done !== undefined) {
    sets.push('done = :done')
    params.done = input.done ? 1 : 0
  }
  if (sets.length === 0) return getTask(db, id)

  const row = db
    .prepare<Record<string, unknown>, TaskRow>(
      `UPDATE tasks SET ${sets.join(', ')} WHERE id = :id RETURNING ${COLUMNS}`,
    )
    .get(params)

  // The AFTER UPDATE trigger rewrites updated_at, so re-read to return current values.
  return row ? getTask(db, id) : undefined
}

export function deleteTask(db: Db, id: number): boolean {
  const result = db.prepare<{ id: number }>('DELETE FROM tasks WHERE id = :id').run({ id })
  return result.changes > 0
}
