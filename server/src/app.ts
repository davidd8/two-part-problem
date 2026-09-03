import express from 'express'
import cors from 'cors'
import type { Db } from './db/index.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { requestLogger } from './middleware/request-logger.js'
import { tasksRouter } from './routes/tasks.js'

/**
 * Builds the Express app around a database handle.
 * Taking the db as an argument keeps tests free to pass an in-memory one.
 */
export function createApp(db: Db) {
  const app = express()

  app.use(cors())
  app.use(express.json())
  if (process.env.NODE_ENV !== 'test') app.use(requestLogger)

  app.get('/api/health', (_req, res) => {
    const { ok } = db.prepare<[], { ok: number }>('SELECT 1 AS ok').get() as { ok: number }
    res.json({ status: 'ok', database: ok === 1 ? 'up' : 'down', uptime: process.uptime() })
  })

  app.use('/api/tasks', tasksRouter(db))

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export type App = ReturnType<typeof createApp>
