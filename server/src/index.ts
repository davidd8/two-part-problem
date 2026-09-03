import { createApp } from './app.js'
import { closeDb, getDb } from './db/index.js'
import { env } from './env.js'

const db = getDb()
const app = createApp(db)

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
  console.log(`Database: ${env.databaseFile}`)
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
