import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskList } from '../components/TaskList.js'
import { makeTask } from './helpers.js'

describe('TaskList', () => {
  it('shows an empty state when there are no tasks', () => {
    render(<TaskList tasks={[]} onToggle={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('renders titles and notes', () => {
    const tasks = [
      makeTask({ id: 1, title: 'With notes', notes: 'the notes' }),
      makeTask({ id: 2, title: 'Without notes', notes: null }),
    ]

    render(<TaskList tasks={tasks} onToggle={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('the notes')).toBeInTheDocument()
  })

  it('reflects done state in the checkbox', () => {
    const tasks = [makeTask({ id: 1, title: 'Done one', done: true })]

    render(<TaskList tasks={tasks} onToggle={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onToggle with the task when the checkbox is clicked', async () => {
    const user = userEvent.setup()
    const task = makeTask({ id: 7, title: 'Toggle me' })
    const onToggle = vi.fn()

    render(<TaskList tasks={[task]} onToggle={onToggle} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('checkbox'))

    expect(onToggle).toHaveBeenCalledWith(task)
  })

  it('gives each delete button an accessible name naming its task', async () => {
    const user = userEvent.setup()
    const tasks = [makeTask({ id: 1, title: 'First' }), makeTask({ id: 2, title: 'Second' })]
    const onDelete = vi.fn()

    render(<TaskList tasks={tasks} onToggle={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete Second' }))

    expect(onDelete).toHaveBeenCalledWith(tasks[1])
  })
})
