import { createApp } from './app.js'
import { closeDb, getDb } from './db/index.js'
import { env } from './env.js'

const db = getDb()
const app = createApp(db)

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
  console.log(`Database: ${env.databaseFile}`)
})

// Without this the bind failure is silent under `tsx watch`: the API never
// comes up, but the client still proxies to whatever else holds the port.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE') throw err
  console.error(
    `Port ${env.PORT} is already in use — another clone's server is probably running.\n` +
      `Give this clone its own block of ports with PORT_OFFSET=10 (or 20, 30 …) in .env.`,
  )
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down`)
    server.close(() => {
      closeDb()
      process.exit(0)
    })
  })
}
