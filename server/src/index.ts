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

let shuttingDown = false

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // A second signal while the first is in flight would re-enter this and log
    // again; tsx sends one per restart, so the guard keeps the output honest.
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n${signal} received, shutting down`)

    server.close(() => {
      closeDb()
      process.exit(0)
    })

    // close() waits on every open socket, and a socket that connected without
    // ever sending a request (a browser preconnect, a TCP health check) never
    // counts as idle — closeIdleConnections() leaves it, so close()'s callback
    // never fires and tsx force-kills us after 5s. Drop them outright.
    server.closeAllConnections()

    // Backstop for anything else that might hold the loop open.
    setTimeout(() => {
      closeDb()
      process.exit(0)
    }, 2000).unref()
  })
}
