import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task } from '@app/shared'
import { App } from '../App.js'
import { emptyResponse, jsonResponse, makeTask, mockFetch } from './helpers.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Backs the mocked endpoints with a mutable array, so refetches see mutations. */
function mockBackend(initial: Task[]) {
  let tasks = [...initial]

  const { calls } = mockFetch({
    'GET /api/tasks': () => jsonResponse({ items: tasks, total: tasks.length }),
    'POST /api/tasks': () => {
      const created = makeTask({ id: tasks.length + 1, title: 'Buy milk' })
      tasks = [...tasks, created]
      return jsonResponse(created, 201)
    },
    'PATCH /api/tasks/1': () => {
      tasks = tasks.map((t) => (t.id === 1 ? { ...t, done: !t.done } : t))
      return jsonResponse(tasks.find((t) => t.id === 1))
    },
    'DELETE /api/tasks/1': () => {
      tasks = tasks.filter((t) => t.id !== 1)
      return emptyResponse()
    },
  })

  return { calls, get tasks() { return tasks } }
}

describe('App', () => {
  it('loads tasks on mount', async () => {
    mockBackend([makeTask({ id: 1, title: 'Existing task' })])

    render(<App />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByText('Existing task')).toBeInTheDocument()
  })

  it('refetches with the selected status filter', async () => {
    const { calls } = mockBackend([makeTask({ id: 1 })])
    const user = userEvent.setup()

    render(<App />)
    await screen.findByText('A task')
    await user.click(screen.getByRole('button', { name: 'open' }))

    await waitFor(() => {
      expect(calls.at(-1)?.url).toBe('/api/tasks?status=open')
    })
  })

  it('creates a task and shows it without a manual refresh', async () => {
    const { calls } = mockBackend([])
    const user = userEvent.setup()

    render(<App />)
    await screen.findByText('Nothing here yet.')

    await user.type(screen.getByLabelText('Task title'), 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Buy milk')).toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1)
  })

  it('toggles a task through the API', async () => {
    const backend = mockBackend([makeTask({ id: 1, title: 'Toggle me', done: false })])
    const user = userEvent.setup()

    render(<App />)
    await screen.findByText('Toggle me')
    await user.click(screen.getByRole('checkbox'))

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked())
    expect(backend.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ done: true })
  })

  it('deletes a task', async () => {
    mockBackend([makeTask({ id: 1, title: 'Delete me' })])
    const user = userEvent.setup()

    render(<App />)
    await screen.findByText('Delete me')
    await user.click(screen.getByRole('button', { name: 'Delete Delete me' }))

    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument()
  })

  it('surfaces an API failure and lets the user dismiss it', async () => {
    mockFetch({
      'GET /api/tasks': () =>
        jsonResponse({ error: { message: 'Database is down', code: 'internal_error' } }, 500),
    })
    const user = userEvent.setup()

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Database is down')

    await user.click(screen.getByRole('button', { name: 'dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
