// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Message } from '@shared/types.js'

const navigate = vi.fn()
const authFetch = vi.fn()
const loadSession = vi.fn()
let projectType: string | undefined = 'chat'
let storeMessages: Message[] = []
let running = false

vi.mock('wouter', () => ({ useLocation: () => ['/', navigate] }))
vi.mock('../../hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))
vi.mock('../../lib/api', () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }))
vi.mock('../../hooks/useCurrentProject', () => ({
  useCurrentProject: () => ({ id: 'p1', name: 'P', type: projectType }),
}))
vi.mock('../../stores/session', () => ({
  useSessionStore: (selector: (s: unknown) => unknown) =>
    selector({ messages: storeMessages, currentSession: { isRunning: running }, loadSession }),
}))

import { ChatMessageActions } from './ChatMessageActions'

const msg = (id: string, role: Message['role'], extra: Partial<Message> = {}): Message =>
  ({ id, role, content: id, timestamp: '2026-01-01T00:00:00Z', ...extra }) as Message

const reply = (variants: Record<string, string[]>) => ({
  ok: true,
  json: () => Promise.resolve({ variants }),
})

beforeEach(() => {
  navigate.mockReset()
  loadSession.mockReset()
  authFetch.mockReset()
  projectType = 'chat'
  running = false
  storeMessages = [msg('u1', 'user'), msg('a1', 'assistant')]
})
afterEach(cleanup)

describe('ChatMessageActions', () => {
  it('renders nothing, and fetches nothing, outside chat projects', () => {
    projectType = 'dev'
    const { container } = render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    expect(container.textContent).toBe('')
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('offers Regenerate under the reply that closes the turn', async () => {
    authFetch.mockResolvedValue(reply({}))
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    expect(screen.getByTestId('chat-regenerate')).toBeTruthy()
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/sessions/s1/versions'))
    expect(screen.queryByTestId('branch-nav')).toBeNull()
  })

  it('shows no controls for an assistant message in the middle of a tool loop', () => {
    storeMessages = [msg('u1', 'user'), msg('a1', 'assistant'), msg('t1', 'tool'), msg('a2', 'assistant')]
    const { container } = render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    expect(container.textContent).toBe('')
  })

  it('shows no controls while the reply is still streaming', () => {
    const { container } = render(
      <ChatMessageActions message={{ ...storeMessages[1]!, isStreaming: true } as Message} sessionId="s1" />,
    )
    expect(container.textContent).toBe('')
  })

  it('shows the position among versions and moves between them', async () => {
    authFetch.mockResolvedValue(reply({ __start__: ['s0', 's1', 's2'] }))
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    await waitFor(() => expect(screen.getByTestId('branch-position').textContent).toBe('2/3'))

    fireEvent.click(screen.getByLabelText('Next version'))
    expect(navigate).toHaveBeenCalledWith('/p/p1/s/s2')
    fireEvent.click(screen.getByLabelText('Previous version'))
    expect(navigate).toHaveBeenCalledWith('/p/p1/s/s0')
  })

  it('disables stepping past either end', async () => {
    authFetch.mockResolvedValue(reply({ __start__: ['s1', 's2'] }))
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    await waitFor(() => expect(screen.getByTestId('branch-position').textContent).toBe('1/2'))
    expect((screen.getByLabelText('Previous version') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Next version') as HTMLButtonElement).disabled).toBe(false)
  })

  it('regenerating branches from this reply and opens the new version', async () => {
    authFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? { ok: true, json: () => Promise.resolve({ session: { id: 'new', projectId: 'p1' } }) }
        : reply({}),
    )
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    fireEvent.click(screen.getByTestId('chat-regenerate'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/p1/s/new'))
    // A version starts running as it is created: it must be loaded afresh, not trusted from a partial cache.
    expect(loadSession).toHaveBeenCalledWith('new', true)
    expect(authFetch).toHaveBeenCalledWith(
      '/api/sessions/s1/versions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ messageId: 'a1' }) }),
    )
  })

  it('shows the error and stays put when branching fails', async () => {
    authFetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? { ok: false, status: 409, json: () => Promise.resolve({ error: 'busy' }) } : reply({}),
    )
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    fireEvent.click(screen.getByTestId('chat-regenerate'))
    expect(await screen.findByText('busy')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('cannot regenerate while a turn is running', () => {
    running = true
    render(<ChatMessageActions message={storeMessages[1]!} sessionId="s1" />)
    expect((screen.getByTestId('chat-regenerate') as HTMLButtonElement).disabled).toBe(true)
  })
})
