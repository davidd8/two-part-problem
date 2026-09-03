import type { RequestHandler } from 'express'

/** One line per request: method, path, status, duration. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = performance.now()
  res.on('finish', () => {
    const ms = (performance.now() - start).toFixed(1)
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`)
  })
  next()
}
