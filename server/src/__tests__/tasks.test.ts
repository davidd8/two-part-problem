import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createDatabase, type Db } from '../db/index.js'

let db: Db
let app: ReturnType<typeof createApp>

beforeEach(() => {
  db = createDatabase(':memory:')
  app = createApp(db)
})

afterEach(() => {
  db.close()
})

describe('GET /api/health', () => {
  it('reports the database is reachable', async () => {
    const res = await request(app).get('/api/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' })
  })
})

describe('/api/tasks', () => {
  it('creates and lists a task', async () => {
    const created = await request(app)
      .post('/api/tasks')
      .send({ title: 'Write a test', notes: 'A short one' })
      .expect(201)

    expect(created.body).toMatchObject({ title: 'Write a test', notes: 'A short one', done: false })
    expect(created.body.id).toBeGreaterThan(0)

    const list = await request(app).get('/api/tasks').expect(200)
    expect(list.body.total).toBe(1)
    expect(list.body.items).toHaveLength(1)
  })

  it('rejects an empty title with a validation error', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '  ' }).expect(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('toggles done and filters by status', async () => {
    const { body: task } = await request(app).post('/api/tasks').send({ title: 'Toggle me' })

    const updated = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ done: true })
      .expect(200)
    expect(updated.body.done).toBe(true)

    await request(app).get('/api/tasks?status=open').expect(200, { items: [], total: 0 })

    const done = await request(app).get('/api/tasks?status=done').expect(200)
    expect(done.body.items).toHaveLength(1)
  })

  it('404s for a task that does not exist', async () => {
    const res = await request(app).get('/api/tasks/999').expect(404)
    expect(res.body.error.code).toBe('not_found')
  })

  it('deletes a task', async () => {
    const { body: task } = await request(app).post('/api/tasks').send({ title: 'Delete me' })
    await request(app).delete(`/api/tasks/${task.id}`).expect(204)
    await request(app).get(`/api/tasks/${task.id}`).expect(404)
  })
})
