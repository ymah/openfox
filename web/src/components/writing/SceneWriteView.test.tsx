// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { authFetch } from '../../lib/api'
import { SceneWriteView } from './SceneWriteView'

const mockNavigate = vi.fn()
const scenePath = 'manuscript/01-act-one/01-chapter-one/01-scene.md'

vi.mock('wouter', () => ({
  useLocation: () => ['/p/p1/write', mockNavigate],
  useSearch: () => `path=${encodeURIComponent(scenePath)}`,
}))

const mockCreateSession = vi.fn()
vi.mock('../../stores/session', () => ({
  useSessionStore: (selector: (s: unknown) => unknown) => selector({ createSession: mockCreateSession }),
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const mockedAuthFetch = vi.mocked(authFetch)

function jsonResponse(data: unknown): Response {
  return { ok: true, json: () => Promise.resolve(data) } as Response
}

describe('SceneWriteView', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset()
    mockNavigate.mockReset()
    mockCreateSession.mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('loads and displays the scene frontmatter and body', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({ path: scenePath, frontmatter: { title: 'Opening', status: 'draft' }, body: 'Once upon a time.' }),
    )
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByDisplayValue('Opening')).toBeTruthy())
    expect(screen.getByDisplayValue('Once upon a time.')).toBeTruthy()
  })

  it('autosaves an edit to the body after the debounce delay', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ path: scenePath, frontmatter: {}, body: '' }))
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledTimes(1))

    const textarea = screen.getByPlaceholderText('Write the scene…')
    await userEvent.type(textarea, 'New prose.')

    await waitFor(
      () => {
        const putCall = mockedAuthFetch.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
        expect(putCall).toBeTruthy()
        expect(JSON.parse((putCall![1] as RequestInit).body as string).body).toBe('New prose.')
      },
      { timeout: 3000 },
    )
  })

  it('does not arm autosave after a failed load (would overwrite the file with an empty body)', async () => {
    mockedAuthFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    } as Response)
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/Could not load this scene/)).toBeTruthy())
    // No editor rendered → nothing to type into, and no PUT can ever be issued
    expect(screen.queryByPlaceholderText('Write the scene…')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(mockedAuthFetch.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')).toBe(false)
  })

  it('ignores a late response from a previous load once the scene changed', async () => {
    let resolveFirst!: (r: Response) => void
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    mockedAuthFetch
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(jsonResponse({ path: scenePath, frontmatter: { title: 'Scene B' }, body: 'B body' }))

    const { rerender } = render(<SceneWriteView projectId="p1" />)
    // A project switch re-runs the load effect (same path in the mocked router)
    rerender(<SceneWriteView projectId="p2" />)
    await waitFor(() => expect(screen.getByDisplayValue('B body')).toBeTruthy())

    // The first (stale) response finally arrives — it must not replace B
    resolveFirst(jsonResponse({ path: scenePath, frontmatter: { title: 'Scene A' }, body: 'A body' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByDisplayValue('B body')).toBeTruthy()
    expect(screen.queryByDisplayValue('A body')).toBeNull()
  })

  it('seeds a draft message and navigates to a new session on "Chat about this scene"', async () => {
    mockedAuthFetch.mockResolvedValue(
      jsonResponse({ path: scenePath, frontmatter: { title: 'Opening' }, body: 'Once upon a time.' }),
    )
    mockCreateSession.mockResolvedValue({ id: 'session-1' })
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Chat about this scene')).toBeTruthy())
    await userEvent.click(screen.getByText('Chat about this scene'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/p/p1/s/session-1'))
    expect(localStorage.getItem('openfox:draft:session-1')).toContain('Opening')
  })

  it('does not print the scene path twice when the scene has no subtitle', async () => {
    mockedAuthFetch.mockResolvedValue(jsonResponse({ path: scenePath, frontmatter: {}, body: 'Once upon a time.' }))
    mockCreateSession.mockResolvedValue({ id: 'session-2' })
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Chat about this scene')).toBeTruthy())
    await userEvent.click(screen.getByText('Chat about this scene'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/p/p1/s/session-2'))
    const draft = localStorage.getItem('openfox:draft:session-2')!
    expect(draft).toContain(scenePath)
    expect(draft.split(scenePath).length - 1).toBe(1) // path appears exactly once, not duplicated
  })
})
