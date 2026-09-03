import type { ApiError, CreateTaskInput, Task, UpdateTaskInput } from '@app/shared'

export interface TaskList {
  items: Task[]
  total: number
}

export type TaskStatus = 'all' | 'open' | 'done'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(
      res.status,
      body?.error.message ?? res.statusText,
      body?.error.code ?? 'unknown',
      body?.error.details,
    )
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  listTasks: (status: TaskStatus = 'all') =>
    request<TaskList>(`/tasks?status=${status}`),

  createTask: (input: CreateTaskInput) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTask: (id: number, input: UpdateTaskInput) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
}
