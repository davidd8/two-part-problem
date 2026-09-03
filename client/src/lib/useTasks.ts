import { useCallback, useEffect, useState } from 'react'
import type { CreateTaskInput, Task } from '@app/shared'
import { api, type TaskStatus } from './api.js'

/**
 * Owns the task list and every mutation against it.
 * Small enough to stay in local state; swap for React Query when the app grows.
 */
export function useTasks(status: TaskStatus) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const { items } = await api.listTasks(status)
      setTasks(items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    },
    [refresh],
  )

  return {
    tasks,
    loading,
    error,
    refresh,
    createTask: (input: CreateTaskInput) => run(() => api.createTask(input)),
    toggleTask: (task: Task) => run(() => api.updateTask(task.id, { done: !task.done })),
    deleteTask: (task: Task) => run(() => api.deleteTask(task.id)),
    dismissError: () => setError(null),
  }
}
