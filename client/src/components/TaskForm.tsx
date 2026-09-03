import { useState, type FormEvent } from 'react'
import type { CreateTaskInput } from '@app/shared'

interface Props {
  onSubmit: (input: CreateTaskInput) => Promise<void>
}

export function TaskForm({ onSubmit }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || submitting) return

    setSubmitting(true)
    await onSubmit({ title: title.trim(), notes: notes.trim() || null })
    setSubmitting(false)
    setTitle('')
    setNotes('')
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        aria-label="Task title"
        placeholder="What needs doing?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
      />
      <input
        aria-label="Notes"
        placeholder="Notes (optional)"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={2000}
      />
      <button type="submit" disabled={!title.trim() || submitting}>
        Add
      </button>
    </form>
  )
}
