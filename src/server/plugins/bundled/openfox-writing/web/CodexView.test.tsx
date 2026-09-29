// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listCodex, saveCodexEntry } from './vault-client'
import { CodexView } from './CodexView'

vi.mock('./vault-client', () => ({
  listCodex: vi.fn(),
  saveCodexEntry: vi.fn(),
}))

const mockedListCodex = vi.mocked(listCodex)
const mockedSaveEntry = vi.mocked(saveCodexEntry)

describe('CodexView', () => {
  beforeEach(() => {
    mockedListCodex.mockReset()
    mockedSaveEntry.mockReset()
    mockedSaveEntry.mockResolvedValue({} as never)
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an empty state per section when the codex has no entries yet', async () => {
    mockedListCodex.mockResolvedValue({ entries: [] })
    render(<CodexView projectId="p1" />)

    await waitFor(() => expect(mockedListCodex).toHaveBeenCalledWith('p1'))
    expect(screen.getByText('Characters')).toBeTruthy()
    expect(screen.getAllByText('None yet').length).toBeGreaterThan(0)
  })

  it('lists an existing entry under its type and opens it for editing on click', async () => {
    mockedListCodex.mockResolvedValue({
      entries: [{ type: 'characters', slug: 'lena', title: 'Lena', tags: [], facts: { age: '34' }, body: 'A pilot.' }],
    } as never)
    render(<CodexView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Lena')).toBeTruthy())
    await userEvent.click(screen.getByText('Lena'))

    expect(screen.getByDisplayValue('Lena')).toBeTruthy()
    expect(screen.getByDisplayValue('34')).toBeTruthy()
    expect(screen.getByDisplayValue('A pilot.')).toBeTruthy()
  })

  it('keeps the entry (and the draft) in the list when saving fails', async () => {
    mockedListCodex.mockResolvedValue({
      entries: [{ type: 'characters', slug: 'lena', title: 'Lena', tags: [], facts: {}, body: 'A pilot.' }],
    } as never)
    mockedSaveEntry.mockRejectedValue(new Error('HTTP 500'))
    render(<CodexView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Lena')).toBeTruthy())
    await userEvent.click(screen.getByText('Lena'))
    const bodyField = screen.getByDisplayValue('A pilot.')
    await userEvent.clear(bodyField)
    await userEvent.type(bodyField, 'A retired pilot.')
    await userEvent.click(screen.getByText('Save'))

    // The error body must not replace the entry: it stays listed and the
    // unsaved edit is still in the editor.
    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeTruthy())
    expect(screen.getByText('Lena')).toBeTruthy()
    expect(screen.getByDisplayValue('A retired pilot.')).toBeTruthy()
  })

  it('creates a new entry via the type-scoped "+ New" control', async () => {
    mockedListCodex.mockResolvedValue({ entries: [] })
    render(<CodexView projectId="p1" />)
    await waitFor(() => expect(mockedListCodex).toHaveBeenCalledTimes(1))

    const newButtons = screen.getAllByText('+ New')
    await userEvent.click(newButtons[0]!) // Characters section is first

    const input = screen.getByPlaceholderText('Title…')
    await userEvent.type(input, 'Lena')
    await userEvent.click(screen.getByText('Add'))

    await waitFor(() =>
      expect(mockedSaveEntry).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'characters', slug: 'lena' })),
    )
  })

  it('opens an existing entry instead of blanking it out when "+ New" is given the same title', async () => {
    mockedListCodex.mockResolvedValue({
      entries: [{ type: 'characters', slug: 'lena', title: 'Lena', tags: [], facts: { age: '34' }, body: 'A pilot.' }],
    } as never)
    render(<CodexView projectId="p1" />)
    await waitFor(() => expect(screen.getByText('Lena')).toBeTruthy())

    const newButtons = screen.getAllByText('+ New')
    await userEvent.click(newButtons[0]!)
    await userEvent.type(screen.getByPlaceholderText('Title…'), 'Lena')
    await userEvent.click(screen.getByText('Add'))

    // Existing content must survive — no destructive PUT for a slug that already exists.
    expect(mockedSaveEntry).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByDisplayValue('A pilot.')).toBeTruthy())
  })
})
