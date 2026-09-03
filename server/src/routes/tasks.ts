import { Router } from 'express'
import { z } from 'zod'
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '@app/shared'
import type { Db } from '../db/index.js'
import * as tasks from '../repositories/tasks.js'
import { HttpError } from '../middleware/errors.js'

const idParamSchema = z.object({ id: z.coerce.number().int().positive() })

export function tasksRouter(db: Db): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const query = listTasksQuerySchema.parse(req.query)
    res.json(tasks.listTasks(db, query))
  })

  router.get('/:id', (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const task = tasks.getTask(db, id)
    if (!task) throw HttpError.notFound(`Task ${id} not found`)
    res.json(task)
  })

  router.post('/', (req, res) => {
    const input = createTaskSchema.parse(req.body)
    res.status(201).json(tasks.createTask(db, input))
  })

  router.patch('/:id', (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    const input = updateTaskSchema.parse(req.body)
    const task = tasks.updateTask(db, id, input)
    if (!task) throw HttpError.notFound(`Task ${id} not found`)
    res.json(task)
  })

  router.delete('/:id', (req, res) => {
    const { id } = idParamSchema.parse(req.params)
    if (!tasks.deleteTask(db, id)) throw HttpError.notFound(`Task ${id} not found`)
    res.status(204).end()
  })

  return router
}
