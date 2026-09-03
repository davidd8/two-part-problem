# app-sqlite

A full-stack TypeScript scaffold: **React + Vite** on the front end, **Express 5** on the back end,
**SQLite** (via `better-sqlite3`) for storage, and a shared package of **zod** schemas so both sides
agree on the same types.

It ships with one working vertical slice — a task list — so every layer has a real example to copy:
migration → repository → route → typed client → React hook → component.

## Quick start

```bash
npm install
npm run db:reset      # create the SQLite file, run migrations, insert demo rows
npm run dev           # API on :3001, web app on :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the Express server, so the
browser only ever talks to one origin.

> `npm install` may report that install scripts are blocked. `better-sqlite3` (native module) and
> `esbuild` need theirs: `npm install-scripts approve better-sqlite3 esbuild`.

## Layout

```
├── shared/            @app/shared — zod schemas + types used by server and client
│   └── src/task.ts
├── server/
│   ├── src/
│   │   ├── index.ts           entrypoint: listen + graceful shutdown
│   │   ├── app.ts             createApp(db) — Express wiring, takes the db so tests can inject one
│   │   ├── env.ts             .env loading + validation
│   │   ├── db/
│   │   │   ├── index.ts       connection + pragmas (WAL, foreign keys, busy timeout)
│   │   │   ├── migrate.ts     migration runner, tracks state in _migrations
│   │   │   ├── migrations/    *.sql, applied in filename order
│   │   │   ├── seed.ts        demo rows
│   │   │   └── cli.ts         migrate | seed | reset
│   │   ├── repositories/      SQL lives here, returns domain types
│   │   ├── routes/            HTTP shape only: parse, delegate, respond
│   │   ├── middleware/        error handling, request logging
│   │   └── __tests__/         vitest + supertest against an in-memory database
│   └── tsup.config.ts         bundles src/ to dist/index.js
└── client/
    └── src/
        ├── lib/api.ts         typed fetch wrapper
        ├── lib/useTasks.ts    data-loading hook
        └── components/
```

## Scripts

Run from the repo root:

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (`tsx watch`) and client (`vite`) together |
| `npm run build` | Bundle the server to `server/dist`, the client to `client/dist` |
| `npm start` | Run the built server |
| `npm test` | Vitest suite (API tests hit an in-memory SQLite database) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Insert demo rows (no-op if the table has data) |
| `npm run db:reset` | Delete the database file, migrate, seed |

Add `-w server` / `-w client` to target one workspace, e.g. `npm run test:watch -w server`.

## Configuration

Copy `.env.example` to `.env` (already done for you on first checkout):

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3001` | Express port |
| `NODE_ENV` | `development` | `test` silences the request logger |
| `DATABASE_PATH` | `./data/app.sqlite` | Relative to the repo root; `:memory:` for an ephemeral DB |

`env.ts` validates these with zod and exits with a readable message if something is wrong.

## Working with the database

**Adding a migration.** Drop a new file in `server/src/db/migrations/` named so it sorts after the
last one (`0002_add_projects.sql`). It runs once, inside a transaction, and gets recorded in
`_migrations`. There is no down-migration: to undo during development, edit the file and
`npm run db:reset`.

**Conventions used by `0001_init.sql`:** `snake_case` columns, `INTEGER` 0/1 for booleans, ISO-8601
UTC strings for timestamps, and an `AFTER UPDATE` trigger that maintains `updated_at`. The
repository layer maps rows to the `camelCase` domain types in `@app/shared`.

**Poking at the data directly:**

```bash
sqlite3 data/app.sqlite '.tables'
sqlite3 data/app.sqlite 'select * from tasks;'
```

`better-sqlite3` is synchronous, so there is no connection pool and no `await` on queries — one
process-wide connection is enough. WAL mode is on, so a reader never blocks a writer.

## Adding a feature

1. `shared/src/` — define the zod schema and export the inferred type.
2. `server/src/db/migrations/` — add the table.
3. `server/src/repositories/` — write the SQL, return domain types.
4. `server/src/routes/` — parse input with the shared schema, call the repository.
5. `server/src/app.ts` — mount the router.
6. `client/src/lib/api.ts` — add the call; the request and response are already typed.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

`client/dist` is a static bundle — serve it from any static host or CDN, or add
`app.use(express.static(...))` to `server/src/app.ts` if you would rather ship one process. Note
that SQLite lives on local disk: the server needs a persistent volume, and it does not scale past
one writer node.
