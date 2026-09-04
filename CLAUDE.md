# app-sqlite

npm workspaces monorepo: `shared` (zod contracts) → `server` (Express 5 + better-sqlite3) →
`client` (React 18 + Vite). `README.md` has the long-form tour and a worked
"add a `projects` resource" example — read its **Adding a feature** section before building a
new resource, and follow it step for step.

## Commands

Run from the repo root; add `-w server` or `-w client` to narrow.

| Command                                       | Does                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                                 | Both servers (client :5173, API :3001; Vite proxies `/api` → API)                                 |
| `npm run check`                               | typecheck + lint + test — **the gate before committing** (~6s)                                    |
| `npm run test:watch`                          | Vitest watch across both workspaces — the tightest loop                                           |
| `npm run e2e`                                 | Playwright; own ports (:5174/:3002) and own database, so it never touches a running `npm run dev` |
| `npm run db:migrate` / `db:seed` / `db:reset` | Reset drops tables **in place**, so it is safe while the dev server holds the file open           |

Type errors do not surface in the dev server — Vite and `tsx` strip types without checking them.
`npm run typecheck` is the only thing that catches them.

## Layout

```
shared/src/*.ts       zod schemas + inferred types; imported by BOTH sides
server/src/
  app.ts              createApp(db) — db is injected so tests pass their own
  db/migrations/      NNNN_name.sql, applied in filename order
  repositories/       all SQL lives here; returns domain types, never raw rows
  routes/             HTTP only: parse input, call a repository, respond
client/src/
  lib/api.ts          typed fetch wrapper, throws ApiRequestError
  lib/useTasks.ts     data loading + mutations
```

## Rules

- **Routes never write SQL; repositories never touch `req`/`res`.** This is what keeps
  repositories unit-testable and routes skimmable. Do not blur it.
- **Contracts live in `shared/`.** Define the zod schema there, `export *` it from
  `shared/src/index.ts`, and let the server validate with it and the client infer types from it.
  Never hand-write a type on the client that duplicates a server shape.
- **SQLite is snake_case, the domain is camelCase.** Booleans are stored `0`/`1`. Each repository
  owns a `Row` interface and a `toRow`-style mapper (see `repositories/tasks.ts`); the mapping
  never leaks past the repository.
- **Migrations are append-only.** The runner records applied names in `_migrations`, so editing an
  applied file silently does nothing — add a new numbered file instead. Prefer a
  `set_updated_at` trigger over remembering the column in every UPDATE.
- **Errors go through `HttpError`** (`middleware/errors.ts`). Throw `HttpError.notFound(...)` /
  `.badRequest(...)`; the handler maps it, and any `ZodError`, into the shared `ApiError` shape.
- **Imports:** `verbatimModuleSyntax` + the `consistent-type-imports` lint rule mean type-only
  imports must be `import type`. Relative imports need the `.js` extension.
- `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, and `noUnusedParameters` are all on.

## Tests

- **Server** — vitest + supertest against `createDatabase(':memory:')`, a fresh db per test
  (`__tests__/tasks.test.ts` is the template). Fast enough to cover every route.
- **Client** — vitest + React Testing Library in jsdom with `fetch` stubbed. Globals are not
  injected: import `describe`/`it`/`expect` from `vitest` explicitly.
- **E2E** — Playwright against the real stack, serial on one worker sharing one SQLite file;
  each test calls `resetDatabase()` first.

## Gotchas

- `shared` ships raw TypeScript (`main: ./src/index.ts`), which is why `tsup` needs it in
  `noExternal` and Vite needs `server.fs.allow: ['..']`. New workspace packages need the same.
- `better-sqlite3` is a native module: `external` in the tsup config, and it plus `esbuild` are
  pinned in the root `allowScripts` so their install scripts can run. A version bump means
  updating `allowScripts` or the install warns and the binary is missing.
