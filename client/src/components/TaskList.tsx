import type { Task } from '@app/shared'

interface Props {
  tasks: Task[]
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
}

export function TaskList({ tasks, onToggle, onDelete }: Props) {
  if (tasks.length === 0) {
    return <p className="empty">Nothing here yet.</p>
  }

  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <li key={task.id} className={task.done ? 'task done' : 'task'}>
          <label>
            <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} />
            <span className="task-title">{task.title}</span>
          </label>
          {task.notes && <p className="task-notes">{task.notes}</p>}
          <button
            className="delete"
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.title}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
