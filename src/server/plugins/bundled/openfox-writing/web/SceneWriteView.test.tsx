// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getScene, saveScene } from './vault-client'
import { SceneWriteView } from './SceneWriteView'
import { PluginRpcError } from '@/lib/plugin-actions'

const mockNavigate = vi.fn()
const scenePath = 'manuscript/01-act-one/01-chapter-one/01-scene.md'

vi.mock('wouter', () => ({
  useLocation: () => ['/p/p1/write', mockNavigate],
  useSearch: () => `path=${encodeURIComponent(scenePath)}`,
}))

const mockCreateSession = vi.fn()
vi.mock('@/stores/session', () => ({
  useSessionStore: (selector: (s: unknown) => unknown) => selector({ createSession: mockCreateSession }),
}))

vi.mock('./vault-client', () => ({
  getScene: vi.fn(),
  saveScene: vi.fn(),
}))

const mockedGetScene = vi.mocked(getScene)
const mockedSaveScene = vi.mocked(saveScene)

describe('SceneWriteView', () => {
  beforeEach(() => {
    mockedGetScene.mockReset()
    mockedSaveScene.mockReset()
    mockedSaveScene.mockResolvedValue({ path: scenePath } as never)
    mockNavigate.mockReset()
    mockCreateSession.mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('loads and displays the scene frontmatter and body', async () => {
    mockedGetScene.mockResolvedValue({
      path: scenePath,
      frontmatter: { title: 'Opening', status: 'draft' },
      body: 'Once upon a time.',
    })
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByDisplayValue('Opening')).toBeTruthy())
    expect(screen.getByDisplayValue('Once upon a time.')).toBeTruthy()
  })

  it('autosaves an edit to the body after the debounce delay', async () => {
    mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: '' })
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

    const textarea = screen.getByPlaceholderText('Write the scene…')
    await userEvent.type(textarea, 'New prose.')

    await waitFor(
      () => {
        expect(mockedSaveScene).toHaveBeenCalled()
        expect(mockedSaveScene.mock.calls[0]?.[3]).toBe('New prose.')
      },
      { timeout: 3000 },
    )
  })

  it('does not arm autosave after a failed load (would overwrite the file with an empty body)', async () => {
    mockedGetScene.mockRejectedValue(new Error('HTTP 500'))
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByText(/Could not load this scene/)).toBeTruthy())
    // No editor rendered → nothing to type into, and no PUT can ever be issued
    expect(screen.queryByPlaceholderText('Write the scene…')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(mockedSaveScene).not.toHaveBeenCalled()
  })

  it('ignores a late response from a previous load once the scene changed', async () => {
    type Scene = { path: string; frontmatter: Record<string, unknown>; body: string }
    let resolveFirst!: (r: Scene) => void
    const first = new Promise<Scene>((resolve) => {
      resolveFirst = resolve
    })
    mockedGetScene
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ path: scenePath, frontmatter: { title: 'Scene B' }, body: 'B body' })

    const { rerender } = render(<SceneWriteView projectId="p1" />)
    // A project switch re-runs the load effect (same path in the mocked router)
    rerender(<SceneWriteView projectId="p2" />)
    await waitFor(() => expect(screen.getByDisplayValue('B body')).toBeTruthy())

    // The first (stale) response finally arrives — it must not replace B
    resolveFirst({ path: scenePath, frontmatter: { title: 'Scene A' }, body: 'A body' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByDisplayValue('B body')).toBeTruthy()
    expect(screen.queryByDisplayValue('A body')).toBeNull()
  })

  it('never starts a save while the previous one is still in flight', async () => {
    mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: '' })
    let releaseFirst: () => void = () => {}
    mockedSaveScene.mockReset()
    mockedSaveScene
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = () => resolve({ path: scenePath }))))
      .mockResolvedValue({ path: scenePath } as never)
    render(<SceneWriteView projectId="p1" />)
    await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

    const textarea = screen.getByPlaceholderText('Write the scene…')
    await userEvent.type(textarea, 'One.')
    await waitFor(() => expect(mockedSaveScene).toHaveBeenCalledTimes(1), { timeout: 3000 })
    await userEvent.type(textarea, ' Two.')
    // The debounce for the second edit elapses while the first save is still pending.
    await new Promise((r) => setTimeout(r, 1500))
    expect(mockedSaveScene).toHaveBeenCalledTimes(1)

    releaseFirst()
    await waitFor(() => expect(mockedSaveScene).toHaveBeenCalledTimes(2))
    expect(mockedSaveScene.mock.calls[1]?.[3]).toBe('One. Two.')
  })

  describe('a scene changed elsewhere while it is being edited', () => {
    const conflict = () => new PluginRpcError('changed', 409, 'conflict')

    it('sends the version it read and the version the last save returned', async () => {
      mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: '', mtime: 100 })
      mockedSaveScene.mockReset()
      mockedSaveScene.mockResolvedValue({ path: scenePath, mtime: 150 } as never)
      render(<SceneWriteView projectId="p1" />)
      await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

      const textarea = screen.getByPlaceholderText('Write the scene…')
      await userEvent.type(textarea, 'One.')
      await waitFor(() => expect(mockedSaveScene).toHaveBeenCalledTimes(1), { timeout: 3000 })
      expect(mockedSaveScene.mock.calls[0]?.[4]).toBe(100)

      await userEvent.type(textarea, ' Two.')
      await waitFor(() => expect(mockedSaveScene).toHaveBeenCalledTimes(2), { timeout: 3000 })
      expect(mockedSaveScene.mock.calls[1]?.[4]).toBe(150)
    })

    it('shows the conflict, stops autosaving, and keeps my text until I choose', async () => {
      mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: '', mtime: 100 })
      mockedSaveScene.mockReset()
      mockedSaveScene.mockRejectedValue(conflict())
      render(<SceneWriteView projectId="p1" />)
      await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

      const textarea = screen.getByPlaceholderText('Write the scene…')
      await userEvent.type(textarea, 'My text.')
      await waitFor(() => expect(screen.getByTestId('scene-conflict')).toBeTruthy(), { timeout: 3000 })

      await userEvent.type(textarea, ' More.')
      await new Promise((r) => setTimeout(r, 1500))
      expect(mockedSaveScene).toHaveBeenCalledTimes(1)
      expect(screen.getByDisplayValue('My text. More.')).toBeTruthy()
    })

    it('"Load the changed version" replaces my text with what is on disk', async () => {
      mockedGetScene
        .mockResolvedValueOnce({ path: scenePath, frontmatter: {}, body: '', mtime: 100 })
        .mockResolvedValue({ path: scenePath, frontmatter: {}, body: 'Agent text.', mtime: 200 })
      mockedSaveScene.mockReset()
      mockedSaveScene.mockRejectedValue(conflict())
      render(<SceneWriteView projectId="p1" />)
      await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

      await userEvent.type(screen.getByPlaceholderText('Write the scene…'), 'My text.')
      await waitFor(() => expect(screen.getByTestId('scene-conflict')).toBeTruthy(), { timeout: 3000 })
      await userEvent.click(screen.getByText('Load the changed version'))

      await waitFor(() => expect(screen.getByDisplayValue('Agent text.')).toBeTruthy())
      expect(screen.queryByTestId('scene-conflict')).toBeNull()
    })

    it('"Keep my version" overwrites the file with what is in the editor', async () => {
      mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: '', mtime: 100 })
      mockedSaveScene.mockReset()
      mockedSaveScene.mockRejectedValueOnce(conflict()).mockResolvedValue({ path: scenePath, mtime: 300 } as never)
      render(<SceneWriteView projectId="p1" />)
      await waitFor(() => expect(mockedGetScene).toHaveBeenCalledTimes(1))

      await userEvent.type(screen.getByPlaceholderText('Write the scene…'), 'My text.')
      await waitFor(() => expect(screen.getByTestId('scene-conflict')).toBeTruthy(), { timeout: 3000 })
      await userEvent.click(screen.getByText('Keep my version'))

      await waitFor(() => expect(mockedSaveScene).toHaveBeenCalledTimes(2))
      expect(mockedSaveScene.mock.calls[1]?.[3]).toBe('My text.')
      expect(mockedSaveScene.mock.calls[1]?.[4]).toBeUndefined()
      await waitFor(() => expect(screen.queryByTestId('scene-conflict')).toBeNull())
    })
  })

  it('seeds a draft message and navigates to a new session on "Chat about this scene"', async () => {
    mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: { title: 'Opening' }, body: 'Once upon a time.' })
    mockCreateSession.mockResolvedValue({ id: 'session-1' })
    render(<SceneWriteView projectId="p1" />)

    await waitFor(() => expect(screen.getByText('Chat about this scene')).toBeTruthy())
    await userEvent.click(screen.getByText('Chat about this scene'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/p/p1/s/session-1'))
    expect(localStorage.getItem('openfox:draft:session-1')).toContain('Opening')
  })

  it('does not print the scene path twice when the scene has no subtitle', async () => {
    mockedGetScene.mockResolvedValue({ path: scenePath, frontmatter: {}, body: 'Once upon a time.' })
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
