# app-sqlite

npm workspaces monorepo: `shared` (zod contracts) → `server` (Express 5 + better-sqlite3) →
`client` (React 18 + Vite). `README.md` is the long-form tour — the commands table, the dev loop,
the database conventions and the install gotchas all live there. This file is only what it does
not already say.

**Before building a new resource, read README's "Adding a feature" and follow it step for step.**
It works a `projects` resource end to end, organized as the slices below.

## How to work here

- **Scope a change to one slice, and say which.** Split the work into the `shared/` contract,
  slice A (`server/src/**`), slice B (`client/src/**`), and any standalone data processing. The
  contract lands first and alone — `shared/src/index.ts` is the one file the other slices would
  otherwise contend on. A and B are then independent (the client types off the contract and stubs
  `fetch`, so it does not wait for the route) and neither drive-by edits the other's files.
  `e2e/` spans layers, so it comes last.
- **Write tests only when asked.** Default to shipping just the change so iteration stays quick;
  reach for coverage when the user asks for it or the work is explicitly meant to land with tests.
  `npm run check` still runs the existing suite, so don't leave it red.
- **`npm run check` before committing.** Type errors never surface in the dev server — Vite and
  `tsx` strip types without checking them, so `typecheck` is the only thing that catches them.

## Invariants

- **Routes never write SQL; repositories never touch `req`/`res`.** This is what keeps
  repositories unit-testable and routes skimmable. Do not blur it.
- **Contracts live in `shared/`.** Define the zod schema there, `export *` it from
  `shared/src/index.ts`, and let the server validate with it and the client infer types from it.
  Never hand-write a type on the client that duplicates a server shape.
- **SQLite is snake_case, the domain is camelCase.** Booleans are stored `0`/`1`. Each repository
  owns a `Row` interface and a `toRow`-style mapper (see `repositories/tasks.ts`); the mapping
  never leaks past the repository.
- **Migrations are append-only.** The runner records applied names in `_migrations`, so editing an
  applied file silently does nothing — add a new numbered file instead. Prefer a `set_updated_at`
  trigger over remembering the column in every UPDATE.
- **Errors go through `HttpError`** (`middleware/errors.ts`). Throw `HttpError.notFound(...)` /
  `.badRequest(...)`; the handler maps it, and any `ZodError`, into the shared `ApiError` shape.
- **Relative imports need the `.js` extension**, and type-only imports must be `import type`
  (`verbatimModuleSyntax` plus the `consistent-type-imports` rule).
- **`shared` ships raw TypeScript** (`main: ./src/index.ts`), which is why `tsup` needs it in
  `noExternal` and Vite needs `server.fs.allow: ['..']`. New workspace packages need the same.

## Where things live

```
shared/src/*.ts       zod schemas + inferred types; imported by BOTH sides
server/src/app.ts     createApp(db) — db is injected so tests pass their own
server/src/{db/migrations,repositories,routes}/
client/src/lib/       api.ts (typed fetch, throws ApiRequestError), useTasks.ts (load + mutate)
```
