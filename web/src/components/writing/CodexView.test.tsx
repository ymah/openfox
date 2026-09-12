// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { authFetch } from '../../lib/api'
import { CodexView } from './CodexView'

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockedAuthFetch = vi.mocked(authFetch)

function jsonResponse(data: unknown): Response {
  return { ok: true, json: () => Promise.resolve(data) } as Response
}

describe('CodexView', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows an empty state per section when the codex has no entries yet', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ entries: [] }))
    render(<CodexView projectId="p1" />)

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledWith('/api/projects/p1/codex'))
    expect(screen.getByText('Characters')).toBeTruthy()
    expect(screen.getAllByText('None yet').length).toBeGreaterThan(0)
  })

  it('lists an existing entry under its type and opens it for editing on click', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({
        entries: [
          { type: 'characters', slug: 'lena', title: 'Lena', tags: [], facts: { age: '34' }, body: 'A pilot.' },
        ],
      }),
    )
    render(<CodexView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Lena')).toBeTruthy())
    await userEvent.click(screen.getByText('Lena'))

    expect(screen.getByDisplayValue('Lena')).toBeTruthy()
    expect(screen.getByDisplayValue('34')).toBeTruthy()
    expect(screen.getByDisplayValue('A pilot.')).toBeTruthy()
  })

  it('creates a new entry via the type-scoped "+ New" control', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ entries: [] }))
    render(<CodexView projectId="p1" />)
    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1))

    const newButtons = screen.getAllByText('+ New')
    await userEvent.click(newButtons[0]!) // Characters section is first

    const input = screen.getByPlaceholderText('Title…')
    await userEvent.type(input, 'Lena')
    await userEvent.click(screen.getByText('Add'))

    await waitFor(() =>
      expect(mockedAuthFetch).toHaveBeenCalledWith(
        '/api/projects/p1/codex/characters/lena',
        expect.objectContaining({ method: 'PUT' }),
      ),
    )
  })

  it('opens an existing entry instead of blanking it out when "+ New" is given the same title', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({
        entries: [
          { type: 'characters', slug: 'lena', title: 'Lena', tags: [], facts: { age: '34' }, body: 'A pilot.' },
        ],
      }),
    )
    render(<CodexView projectId="p1" />)
    await waitFor(() => expect(screen.getByText('Lena')).toBeTruthy())

    const newButtons = screen.getAllByText('+ New')
    await userEvent.click(newButtons[0]!)
    await userEvent.type(screen.getByPlaceholderText('Title…'), 'Lena')
    await userEvent.click(screen.getByText('Add'))

    // Existing content must survive — no destructive PUT for a slug that already exists.
    expect(mockedAuthFetch).not.toHaveBeenCalledWith(
      '/api/projects/p1/codex/characters/lena',
      expect.objectContaining({ method: 'PUT' }),
    )
    await waitFor(() => expect(screen.getByDisplayValue('A pilot.')).toBeTruthy())
  })
})
