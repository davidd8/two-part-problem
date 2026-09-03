import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskForm } from '../components/TaskForm.js'

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<TaskForm onSubmit={onSubmit} />)
  return {
    user: userEvent.setup(),
    onSubmit,
    title: screen.getByLabelText('Task title'),
    notes: screen.getByLabelText('Notes'),
    add: screen.getByRole('button', { name: 'Add' }),
  }
}

describe('TaskForm', () => {
  it('disables Add until a title is typed', async () => {
    const { user, title, add } = setup()

    expect(add).toBeDisabled()
    await user.type(title, 'Buy milk')
    expect(add).toBeEnabled()
  })

  it('keeps Add disabled for a whitespace-only title', async () => {
    const { user, title, add } = setup()

    await user.type(title, '   ')

    expect(add).toBeDisabled()
  })

  it('submits trimmed values', async () => {
    const { user, onSubmit, title, notes, add } = setup()

    await user.type(title, '  Buy milk  ')
    await user.type(notes, '  semi-skimmed  ')
    await user.click(add)

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Buy milk', notes: 'semi-skimmed' })
  })

  it('sends null rather than an empty string when notes are blank', async () => {
    const { user, onSubmit, title, add } = setup()

    await user.type(title, 'Buy milk')
    await user.click(add)

    expect(onSubmit).toHaveBeenCalledWith({ title: 'Buy milk', notes: null })
  })

  it('clears both fields after a successful submit', async () => {
    const { user, title, notes, add } = setup()

    await user.type(title, 'Buy milk')
    await user.type(notes, 'semi-skimmed')
    await user.click(add)

    expect(title).toHaveValue('')
    expect(notes).toHaveValue('')
  })
})
