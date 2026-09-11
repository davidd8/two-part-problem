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
git clone https://github.com/davidd8/app-sqlite-starter.git
cd app-sqlite-starter
npm install
cp .env.example .env
npm run db:reset        # create the database, run migrations, insert demo rows
npm run dev             # API on :3001, web app on :5173
```

To run the end-to-end tests you also need the browser binary, which is not in the repo:

```bash
npx playwright install chromium
```

Open **http://localhost:5173**. Vite proxies `/api/*` to Express, so the browser sees a single origin
and there is no CORS to configure.

Verify the whole thing at any time with `npm run check` (typecheck + lint + tests, ~5.4s).

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

| What you do         | What happens                                        | Measured  |
| ------------------- | --------------------------------------------------- | --------- |
| `npm run dev`       | Both servers up                                     | **0.8s**  |
| Edit a client file  | Vite HMR, no reload, state preserved                | **~10ms** |
| Edit a server file  | `tsx` restarts the API                              | **0.4s**  |
| `npm test`          | 28 tests: API against in-memory SQLite, UI in jsdom | **2.7s**  |
| `npm run typecheck` | `tsc --noEmit`, all three packages                  | **2.1s**  |
| `npm run check`     | typecheck + lint + test                             | **~5.4s** |
| `npm run build`     | Server bundle + client bundle                       | **1.1s**  |

Type errors surface in your editor, not in the dev server — Vite and `tsx` strip types without
checking them, which is why they are this fast. `npm run check` is the gate before you commit.

`npm run test:watch` re-runs affected tests as you edit, which is usually a tighter loop than
clicking through the UI. It watches both workspaces; `-w server` or `-w client` narrows it.

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
  __tests__/              vitest + React Testing Library, fetch stubbed
e2e/                      Playwright specs; own ports and own database
```

The layering rule: **routes never write SQL, repositories never touch `req`/`res`.** That is what
makes the repositories directly unit-testable and the routes thin enough to skim.

---

## Adding a feature

Worked example: a `projects` resource that tasks can belong to.

**Scope the work by layer.** The three workspaces are the seams to split on. The contract in
`shared/` is the only real coupling point — land it first, on its own, and the server and client
slices can then be built in parallel by different people without editing the same files.

| Slice           | Owns                                             | Depends on              |
| --------------- | ------------------------------------------------ | ----------------------- |
| **1. Contract** | `shared/src/project.ts`, `shared/src/index.ts`   | nothing                 |
| **A. Server**   | `server/src/{db,repositories,routes}/`, `app.ts` | the contract            |
| **B. Client**   | `client/src/{lib,components}/`                   | the contract            |
| **C. Data**     | `server/src/db/seed.ts`, one-off scripts         | the contract, sometimes |
| **E2E** (join)  | `e2e/`                                           | A and B both landed     |

Slice B does not have to wait for slice A: the client types come from the contract, and the client
tests stub `fetch`, so the whole UI can be built and tested before the route exists. Keep each change
inside its own slice — no drive-by edits into another one — and the merges stay trivial.

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

That barrel file is the one line both later slices would otherwise contend on, which is the other
reason this step goes in by itself.

---

### Slice A — server

Everything below lives under `server/src/`. Nothing here imports from `client/`.

#### A1. Migrate — `server/src/db/migrations/0002_projects.sql`

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

#### A2. Query — `server/src/repositories/projects.ts`

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

#### A3. Expose — `server/src/routes/projects.ts`

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

#### A4. Mount it — `server/src/app.ts`

```ts
app.use('/api/projects', projectsRouter(db))
```

#### A5. Test it — `server/src/__tests__/projects.test.ts`

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

`npm test -w server` and `npm run typecheck -w server` verify this slice on its own; the root `npm run check` stays the gate before committing.

---

### Slice B — client

Everything below lives under `client/src/`. It needs the contract from step 1 and nothing else from
slice A — `fetch` is stubbed in the tests, so this is buildable and verifiable before the route is
written.

#### B1. Call it — `client/src/lib/api.ts`

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

#### B2. Load it — `client/src/lib/useProjects.ts`

One hook owns the data and the mutations for the resource, the way `useTasks` does. Components stay
presentational.

```ts
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setProjects(await api.listProjects())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { projects, loading, refresh }
}
```

#### B3. Test it — `client/src/__tests__/`

`mockFetch` stands in for the API, so this passes with no server running:

```ts
mockFetch({ 'GET /api/projects': () => jsonResponse([{ id: 1, name: 'Website' }]) })
render(<ProjectList />)
expect(await screen.findByText('Website')).toBeInTheDocument()
```

`npm test -w client` and `npm run typecheck -w client` verify this slice on its own, with no server running.

---

### Slice C — data processing

Anything that is neither a request handler nor UI — demo rows in `server/src/db/seed.ts`, a
backfill, an import script — is its own slice. Keep it out of the request path and out of the
repositories that routes call, so it can be written and run without coordinating with A or B.

### Joining the slices back up

The end-to-end tests in `e2e/` are the only tier that spans layers, so they come last, once A and B
are both in. That is also where a mismatch between the two shows up — everything before it was
verified against the contract rather than against the other side.

---

## Testing

35 tests in three tiers: 29 fast unit/integration tests that need nothing running, and 6
end-to-end tests that drive a real browser against the real stack.

**Server** (`server/src/__tests__/`) — vitest + supertest. Each test gets a fresh `:memory:`
database, so tests are isolated and nothing needs cleaning up:

```ts
beforeEach(() => {
  db = createDatabase(':memory:')
  app = createApp(db)
})
```

That works because `createApp` takes the database as an argument. Requests go through the real
Express stack — routing, zod validation, error middleware, SQL — against a real SQLite database. The
only thing not exercised is the network socket.

**Client** (`client/src/__tests__/`) — vitest + React Testing Library in jsdom. `fetch` is stubbed
per test by the `mockFetch` helper in `__tests__/helpers.ts`, which records what was sent so tests
can assert on the request:

```ts
mockFetch({ 'GET /api/tasks': () => jsonResponse({ items: [makeTask()], total: 1 }) })
render(<App />)
expect(await screen.findByText('A task')).toBeInTheDocument()
```

`App.test.tsx` backs those handlers with a mutable array, so a create or toggle is visible to the
refetch that follows — enough to cover `useTasks` end to end without a server.

Queries go through roles and labels (`getByRole('button', { name: 'Add' })`) rather than test ids, so
the tests break when the UI stops being reachable, not when a class name changes.

**End-to-end** (`e2e/`) — Playwright driving Chromium against Vite, Express, and a real SQLite file.
This is the only tier that exercises the Vite proxy, real HTTP, and data that actually survives a
page reload:

```ts
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.reload()
await expect(page.getByText('Write an e2e test')).toBeVisible() // only passes if it reached SQLite
```

It runs on **its own ports (3002/5174) and its own database** (`data/e2e.sqlite`), so `npm run e2e`
is safe while `npm run dev` is running and never touches your dev data. `playwright.config.ts`
starts both servers itself; `e2e/helpers.ts` resets the e2e database before each test.

Two Playwright gotchas the suite already ran into, worth knowing before you write more:

- `getByRole('button', { name: 'Add' })` matches accessible names by **substring**, so it also hit
  `aria-label="Delete Add a migration"`. Use `exact: true`. React Testing Library defaults to
  full-string matching, so the jsdom tests do not warn you about this.
- `.check()` verifies the checkbox immediately after clicking it. These checkboxes are controlled by
  server state, so they only read as checked once the PATCH and the refetch land — the check races
  and fails. Use `.click()` followed by `expect(...).toBeChecked()`, which retries.

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

| Command                           | Does                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                     | Server and client together                                   |
| `npm run check`                   | typecheck + lint + test — run before committing              |
| `npm test` / `npm run test:watch` | Vitest across both workspaces, one-shot or watch             |
| `npm run e2e`                     | Playwright end-to-end tests (starts its own servers)         |
| `npm run e2e:ui`                  | Playwright UI mode — step through a run, time-travel the DOM |
| `npm run e2e:report`              | Open the HTML report from the last run                       |
| `npm run typecheck`               | `tsc --noEmit` across all packages                           |
| `npm run lint` / `npm run format` | ESLint / Prettier                                            |
| `npm run build`                   | Server → `server/dist`, client → `client/dist`               |
| `npm start`                       | Run the built server                                         |
| `npm run db:migrate`              | Apply pending migrations                                     |
| `npm run db:seed`                 | Insert demo rows (no-op if the table has data)               |
| `npm run db:reset`                | Drop all tables, migrate, seed                               |
| `npm run db:checkpoint`           | Fold the WAL into the main database file                     |

---

## Configuration

`.env` at the repo root, validated by `server/src/env.ts` — a bad value fails at startup with a
readable message rather than at the first query.

| Variable        | Default             | Notes                                               |
| --------------- | ------------------- | --------------------------------------------------- |
| `PORT_OFFSET`   | `0`                 | Shifts every port this clone uses — see below       |
| `PORT`          | derived             | Pins the API port directly, ignoring `PORT_OFFSET`  |
| `NODE_ENV`      | `development`       | `test` silences the request logger                  |
| `DATABASE_PATH` | `./data/app.sqlite` | Relative to the repo root; `:memory:` for ephemeral |

---

## Running several features side by side

One feature per clone. Each clone gets its own branch and its own block of ports, and because
`node_modules`, `.env` and `data/*.sqlite` are all per-directory, that is the whole isolation story.

| Directory            | Branch      | `PORT_OFFSET` | dev API | dev web | e2e API | e2e web |
| -------------------- | ----------- | ------------- | ------- | ------- | ------- | ------- |
| `app-sqlite-starter` | `main`      | `0`           | 3001    | 5173    | 3002    | 5174    |
| `app-sqlite-a`       | `feature-a` | `10`          | 3011    | 5183    | 3012    | 5184    |
| `app-sqlite-b`       | `feature-b` | `20`          | 3021    | 5193    | 3022    | 5194    |

Use multiples of 10. An offset of `1` would put one clone's dev API on 3002 — another clone's e2e
port. Keeping the original directory on `main` at offset `0` is worth it: you always have a clean
copy to compare against and to merge into.

### Setting up a feature clone

```bash
git clone https://github.com/davidd8/app-sqlite-starter.git app-sqlite-a
cd app-sqlite-a
git switch -c feature-a
npm install
cp .env.example .env
sed -i '' 's/^PORT_OFFSET=0/PORT_OFFSET=10/' .env   # 20 for the next one
npm run db:reset
npm run dev                                          # API :3011, web :5183
```

About five seconds of setup. From here the clone is completely independent — `npm run dev`,
`npm run check` and `npm run e2e` all work at the same time as every other clone, against its own
database.

If you forget the offset, both halves fail loudly rather than quietly sharing: Vite refuses to
start (`strictPort`), and the API prints which port is taken and what to set.

### Moving commits between clones

Clones can fetch from each other directly, so work in progress does not have to round-trip through
GitHub:

```bash
# from app-sqlite-b, to build on a commit that only exists in app-sqlite-a
git remote add a ../app-sqlite-a
git fetch a
git rebase a/feature-a
```

### The two things that actually collide

Everything else is per-clone. These two are shared, and both bite at merge time rather than while
you work.

**The contract.** `shared/src/index.ts` is the one file every slice touches. Land a new contract on
`main` first, by itself, then start the feature branches from it — that is what the "Adding a
feature" section means by the contract going in first and alone.

**Migration numbers.** Migrations are recorded by _filename_, and applied in filename order. If two
clones both add `0002_*.sql`, each database ends up with a different history:

```
clone B applies its own:   0002_zzz_tags.sql
then merges A's:           0002_aaa_projects.sql   <- applied second, after zzz
a fresh npm run db:reset:  0002_aaa_projects.sql, 0002_zzz_tags.sql   <- aaa first
```

Same code, two different schema orders — so a migration that works in your clone can fail on a
fresh reset, or for whoever merges next. Claim distinct numbers up front (feature A takes `0002`,
feature B takes `0003`), or renumber before merging.

### Finishing a feature

Run `npm run check` and `npm run e2e` in the feature clone, push the branch, and merge it on
GitHub. Then in the `main` clone, `git pull` and `npm run db:reset` to pick up any new migration.
When the branch is merged, `rm -rf` the clone — nothing lives in it that is not on the remote.

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
