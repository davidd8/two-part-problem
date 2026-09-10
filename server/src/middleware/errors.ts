import type { ErrorRequestHandler, RequestHandler } from 'express'
import { z } from 'zod'
import type { ApiError } from '@app/shared'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string = 'error',
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }

  static notFound(message = 'Not found') {
    return new HttpError(404, message, 'not_found')
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, message, 'bad_request', details)
  }
}

export const notFoundHandler: RequestHandler = (req) => {
  throw HttpError.notFound(`No route for ${req.method} ${req.path}`)
}

/** Turns anything thrown in a route into the ApiError shape the client expects. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    const body: ApiError = {
      error: {
        message: 'Validation failed',
        code: 'validation_error',
        details: z.treeifyError(err),
      },
    }
    res.status(400).json(body)
    return
  }

  if (err instanceof HttpError) {
    const body: ApiError = {
      error: { message: err.message, code: err.code, details: err.details },
    }
    res.status(err.status).json(body)
    return
  }

  console.error('Unhandled error:', err)
  const body: ApiError = { error: { message: 'Internal server error', code: 'internal_error' } }
  res.status(500).json(body)
}
