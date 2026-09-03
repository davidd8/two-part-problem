import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, api } from '../lib/api.js'
import { emptyResponse, jsonResponse, makeTask, mockFetch } from './helpers.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  it('requests the list endpoint with the status filter', async () => {
    const { calls } = mockFetch({
      'GET /api/tasks': () => jsonResponse({ items: [makeTask()], total: 1 }),
    })

    const result = await api.listTasks('open')

    expect(calls[0]?.url).toBe('/api/tasks?status=open')
    expect(result.total).toBe(1)
  })

  it('sends JSON with a content-type header on create', async () => {
    const { calls, fetchMock } = mockFetch({
      'POST /api/tasks': () => jsonResponse(makeTask({ title: 'New' }), 201),
    })

    await api.createTask({ title: 'New', notes: null })

    expect(calls[0]).toMatchObject({ method: 'POST', body: { title: 'New', notes: null } })
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      'Content-Type': 'application/json',
    })
  })

  it('returns undefined for a 204 instead of parsing an empty body', async () => {
    mockFetch({ 'DELETE /api/tasks/1': () => emptyResponse() })

    await expect(api.deleteTask(1)).resolves.toBeUndefined()
  })

  it('throws ApiRequestError carrying the server error payload', async () => {
    mockFetch({
      'POST /api/tasks': () =>
        jsonResponse(
          { error: { message: 'Validation failed', code: 'validation_error', details: { x: 1 } } },
          400,
        ),
    })

    const error = await api.createTask({ title: '' }).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 400,
      message: 'Validation failed',
      code: 'validation_error',
      details: { x: 1 },
    })
  })

  it('falls back to the status text when the error body is not JSON', async () => {
    mockFetch({
      'GET /api/tasks': () => new Response('<html>502</html>', { status: 502 }),
    })

    const error = (await api.listTasks().catch((err: unknown) => err)) as ApiRequestError

    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.status).toBe(502)
    expect(error.code).toBe('unknown')
  })
})
