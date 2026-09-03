import type { Task } from '@app/shared'
import { vi } from 'vitest'

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'A task',
    notes: null,
    done: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export interface FetchCall {
  url: string
  method: string
  body: unknown
}

/**
 * Replaces global fetch with a handler keyed by "METHOD /path".
 * Returns the recorded calls so tests can assert on what was sent.
 */
export function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const calls: FetchCall[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })

    const handler = handlers[`${method} ${url}`] ?? handlers[`${method} ${url.split('?')[0]}`]
    if (!handler) throw new Error(`Unhandled request: ${method} ${url}`)
    return handler()
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export const emptyResponse = (status = 204) => new Response(null, { status })
