import { z } from 'zod'

/**
 * Types and validation schemas shared by the server and the client.
 * The server validates requests with these; the client gets the types for free.
 */

export const taskSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  notes: z.string().nullable(),
  done: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().trim().max(2000).nullish(),
})

export const updateTaskSchema = createTaskSchema
  .extend({ done: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' })

export const listTasksQuerySchema = z.object({
  status: z.enum(['all', 'open', 'done']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type Task = z.infer<typeof taskSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>

/** Shape returned by the API for any non-2xx response. */
export interface ApiError {
  error: {
    message: string
    code: string
    details?: unknown
  }
}
