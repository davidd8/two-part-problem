# app-sqlite

Full-stack TypeScript scaffold: **React + Vite** client, **Express 5** API, **SQLite** storage via
`better-sqlite3`, and a shared package of **zod** schemas so the client and server derive their types
from one definition.

A task list is implemented end to end as a worked example — migration → repository → route → typed
client → hook → component. Copy that path when you add your own features, then delete it.

---

## Getting set up

You need **Node 20.11+** (developed on 24) and nothing else. No Docker, no database server, no
`brew install`.

```bash
git clone https://github.com/davidd8/app-sqlite.git
cd app-sqlite
npm install
cp .env.example .env
npm run db:reset        # create the database, run migrations, insert demo rows
npm run dev             # API on :3001, web app on :5173
```

Open **http://localhost:5173**. Vite proxies `/api/*` to Express, so the browser sees a single origin
and there is no CORS to configure.

Verify the whole thing at any time with `npm run check` (typecheck + lint + tests, ~4s).

### About that `npm install` warning

npm 11 blocks package install scripts by default. This repo commits an `allowScripts` block in
`package.json` covering the two that need them — `better-sqlite3` (compiles a native binding) and
`esbuild` (downloads its binary) — so a fresh `npm install` / `npm ci` works with no manual approval.

You will still see a warning about **`fsevents`**. Ignore it: it ships a prebuilt binary in its
tarball, and macOS file watching works without running its script.

If you ever do see `Could not locate the bindings file` from `better-sqlite3`, its native build was
skipped. Fix it with:

```bash
npm install-scripts approve better-sqlite3 esbuild
```

---

## The development loop

| What you do         | What happens                         | Measured  |
| ------------------- | ------------------------------------ | --------- |
| `npm run dev`       | Both servers up                      | **0.8s**  |
| Edit a client file  | Vite HMR, no reload, state preserved | **~10ms** |
| Edit a server file  | `tsx` restarts the API               | **0.4s**  |
| `npm test`          | 7 tests against in-memory SQLite     | **0.7s**  |
| `npm run typecheck` | `tsc --noEmit`, all three packages   | **2.1s**  |
| `npm run check`     | typecheck + lint + test              | **~4s**   |
| `npm run build`     | Server bundle + client bundle        | **1.1s**  |

Type errors surface in your editor, not in the dev server — Vite and `tsx` strip types without
checking them, which is why they are this fast. `npm run check` is the gate before you commit.

`npm run test:watch` re-runs affected tests as you edit, which is usually a tighter loop than
clicking through the UI.

---

## Layout

```
shared/src/task.ts        zod schemas + inferred types, imported by both sides
server/src/
  index.ts                entrypoint: listen, graceful shutdown
  app.ts                  createApp(db) — Express wiring; db is injected so tests can pass their own
  env.ts                  .env loading, validated with zod, exits on bad config
  db/
    index.ts              connection + pragmas (WAL, foreign keys, busy timeout)
    migrate.ts            migration runner and schema reset
    migrations/*.sql      applied in filename order, recorded in _migrations
    seed.ts               demo rows
    cli.ts                migrate | seed | reset | checkpoint
  repositories/           all SQL lives here; returns domain types, never raw rows
  routes/                 HTTP only: parse input, call a repository, respond
  middleware/             error mapping, request logging
  __tests__/              vitest + supertest against an in-memory database
client/src/
  lib/api.ts              typed fetch wrapper, throws ApiRequestError
  lib/useTasks.ts         data loading + mutations
  components/             TaskForm, TaskList
```

The layering rule: **routes never write SQL, repositories never touch `req`/`res`.** That is what
makes the repositories directly unit-testable and the routes thin enough to skim.

---

## Adding a feature

Worked example: a `projects` resource that tasks can belong to.

### 1. Define the contract — `shared/src/project.ts`

Both sides import this. The server validates with it; the client gets types from it.

```ts
import { z } from 'zod'

export const projectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  createdAt: z.string(),
})

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
})

export type Project = z.infer<typeof projectSchema>
export type CreateProjectInput = z.infer<typeof createProjectSchema>
```

Export it from `shared/src/index.ts`:

```ts
export * from './project.js'
```

### 2. Migrate — `server/src/db/migrations/0002_projects.sql`

Name it so it sorts after the last migration. It runs once, in a transaction, and is recorded in
`_migrations`.

```sql
CREATE TABLE projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_project_id ON tasks (project_id);
```

Apply it with `npm run db:migrate`, or just save the file — the dev server runs migrations on boot,
and `tsx` restarts it when the directory changes.

### 3. Query — `server/src/repositories/projects.ts`

Prepared statements with named parameters. Map snake_case rows to camelCase domain types here so
nothing above this layer knows about column names.

```ts
import type { CreateProjectInput, Project } from '@app/shared'
import type { Db } from '../db/index.js'

interface ProjectRow {
  id: number
  name: string
  created_at: string
}

const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
})

export function listProjects(db: Db): Project[] {
  return db
    .prepare<[], ProjectRow>('SELECT id, name, created_at FROM projects ORDER BY name')
    .all()
    .map(toProject)
}

export function createProject(db: Db, input: CreateProjectInput): Project {
  const row = db
    .prepare<{ name: string }, ProjectRow>(
      'INSERT INTO projects (name) VALUES (:name) RETURNING id, name, created_at',
    )
    .get({ name: input.name })
  return toProject(row as ProjectRow)
}
```

### 4. Expose — `server/src/routes/projects.ts`

`.parse()` throws on bad input and the error middleware turns that into a 400 with field-level
details. Thrown `HttpError`s become their status. You do not need try/catch — Express 5 forwards
async errors on its own.

```ts
import { Router } from 'express'
import { createProjectSchema } from '@app/shared'
import type { Db } from '../db/index.js'
import * as projects from '../repositories/projects.js'

export function projectsRouter(db: Db): Router {
  const router = Router()

  router.get('/', (_req, res) => res.json(projects.listProjects(db)))

  router.post('/', (req, res) => {
    const input = createProjectSchema.parse(req.body)
    res.status(201).json(projects.createProject(db, input))
  })

  return router
}
```

### 5. Mount it — `server/src/app.ts`

```ts
app.use('/api/projects', projectsRouter(db))
```

### 6. Call it — `client/src/lib/api.ts`

```ts
export const api = {
  // ...
  listProjects: () => request<Project[]>('/projects'),
  createProject: (input: CreateProjectInput) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
}
```

Request and response are both typed from step 1. Rename a field in the schema and every call site
that needs updating turns red in `npm run typecheck`.

### 7. Test it — `server/src/__tests__/projects.test.ts`

Each test gets a fresh in-memory database, so tests are isolated and there is nothing to clean up.

```ts
beforeEach(() => {
  db = createDatabase(':memory:')
  app = createApp(db)
})

it('creates a project', async () => {
  const res = await request(app).post('/api/projects').send({ name: 'Website' }).expect(201)
  expect(res.body.name).toBe('Website')
})
```

---

## Working with the database

### Conventions

| Concern      | Choice                              | Why                                              |
| ------------ | ----------------------------------- | ------------------------------------------------ |
| Column names | `snake_case`                        | SQL convention; repositories map to camelCase    |
| Booleans     | `INTEGER` + `CHECK (col IN (0,1))`  | SQLite has no boolean type                       |
| Timestamps   | ISO-8601 UTC `TEXT`                 | Sorts lexicographically, unambiguous, JSON-ready |
| `updated_at` | `AFTER UPDATE` trigger              | Cannot be forgotten in a query                   |
| Primary keys | `INTEGER PRIMARY KEY AUTOINCREMENT` | Rowid alias, no reuse of deleted ids             |

### Migrations

Forward-only, no down-migrations. During development, edit the migration and run `npm run db:reset`.
Once a migration has run somewhere you care about, write a new one instead.

`ALTER TABLE` in SQLite only supports `ADD COLUMN`, `DROP COLUMN`, and `RENAME`. To change a column's
type or constraints you create a new table, copy the rows, drop the old one, and rename — all inside
one migration file.

### Inspecting the data

Any SQLite viewer works — TablePlus, DB Browser, a VS Code extension, or the CLI:

```bash
sqlite3 data/app.sqlite '.tables'
sqlite3 data/app.sqlite 'select * from tasks;'
```

**One gotcha.** The database runs in WAL mode, so recent writes live in `data/app.sqlite-wal` until
they are checkpointed. Viewers that open the database properly (the `sqlite3` CLI, TablePlus, DB
Browser) read the WAL and show current data. Viewers that just load the bytes of `app.sqlite` —
several editor extensions do this — will show **stale** data. If your viewer looks out of date:

```bash
npm run db:checkpoint    # folds the WAL back into the main file
```

`npm run db:reset` is safe to run while `npm run dev` is going: it drops and recreates tables through
the same file rather than deleting it, so the running server keeps working.

---

## Scripts

Run from the repo root; add `-w server` or `-w client` to target one workspace.

| Command                           | Does                                            |
| --------------------------------- | ----------------------------------------------- |
| `npm run dev`                     | Server and client together                      |
| `npm run check`                   | typecheck + lint + test — run before committing |
| `npm test` / `npm run test:watch` | Vitest, one-shot or watch                       |
| `npm run typecheck`               | `tsc --noEmit` across all packages              |
| `npm run lint` / `npm run format` | ESLint / Prettier                               |
| `npm run build`                   | Server → `server/dist`, client → `client/dist`  |
| `npm start`                       | Run the built server                            |
| `npm run db:migrate`              | Apply pending migrations                        |
| `npm run db:seed`                 | Insert demo rows (no-op if the table has data)  |
| `npm run db:reset`                | Drop all tables, migrate, seed                  |
| `npm run db:checkpoint`           | Fold the WAL into the main database file        |

---

## Configuration

`.env` at the repo root, validated by `server/src/env.ts` — a bad value fails at startup with a
readable message rather than at the first query.

| Variable        | Default             | Notes                                               |
| --------------- | ------------------- | --------------------------------------------------- |
| `PORT`          | `3001`              | Express port                                        |
| `NODE_ENV`      | `development`       | `test` silences the request logger                  |
| `DATABASE_PATH` | `./data/app.sqlite` | Relative to the repo root; `:memory:` for ephemeral |

---

## Production

```bash
npm run build
NODE_ENV=production npm start
```

`client/dist` is a static bundle — put it on any static host, or serve it from Express with
`app.use(express.static(...))` if you would rather run one process.

Things SQLite decides for you: the database is a file on local disk, so the server needs a persistent
volume and **cannot scale beyond one node**. Writes serialize behind a single writer (WAL keeps
readers non-blocking). Backups are file copies — use [Litestream](https://litestream.io) to stream
them somewhere durable. If you expect multiple writer nodes, managed backups, or Postgres-specific
features, move to Postgres before there is data to migrate.
