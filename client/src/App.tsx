import { useState } from 'react'
import { TaskForm } from './components/TaskForm.js'
import { TaskList } from './components/TaskList.js'
import { useTasks } from './lib/useTasks.js'
import type { TaskStatus } from './lib/api.js'

const FILTERS: TaskStatus[] = ['all', 'open', 'done']

export function App() {
  const [status, setStatus] = useState<TaskStatus>('all')
  const { tasks, loading, error, createTask, toggleTask, deleteTask, dismissError } =
    useTasks(status)

  return (
    <main className="app">
      <header>
        <h1>Tasks</h1>
        <p className="subtitle">React + Express + SQLite</p>
      </header>

      <TaskForm onSubmit={createTask} />

      <nav className="filters">
        {FILTERS.map((value) => (
          <button
            key={value}
            className={value === status ? 'filter active' : 'filter'}
            onClick={() => setStatus(value)}
          >
            {value}
          </button>
        ))}
      </nav>

      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={dismissError}>dismiss</button>
        </div>
      )}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : (
        <TaskList tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} />
      )}
    </main>
  )
}
