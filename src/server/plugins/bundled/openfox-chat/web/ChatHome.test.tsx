// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const navigate = vi.fn()
const createSession = vi.fn()
const resetPendingSessionCreate = vi.fn()
const listSessions = vi.fn()
const authFetch = vi.fn()

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useLocation: () => ['/', navigate],
}))
vi.mock('@/hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))
vi.mock('@/hooks/useCurrentProject', () => ({
  useCurrentProject: () => ({ id: 'p1', name: 'Général', workdir: '/w' }),
}))
vi.mock('@/hooks/useAgents', () => ({
  useAgents: () => ({
    agents: [
      {
        id: 'chat-assistant',
        name: 'Assistant',
        description: 'General',
        subagent: false,
        allowedTools: [],
        category: 'chat',
      },
      { id: 'chat-tutor', name: 'Tutor', description: 'Teaches', subagent: false, allowedTools: [], category: 'chat' },
      { id: 'planner', name: 'Planner', description: 'Dev', subagent: false, allowedTools: [], category: 'dev' },
    ],
  }),
}))
vi.mock('@/hooks/useWorkflows', () => ({
  useWorkflows: () => ({
    workflows: [
      { id: 'chat-decide', name: 'Décider', description: 'Choose', category: 'chat' },
      { id: 'default', name: 'Default', description: 'Dev', category: 'dev' },
    ],
  }),
}))
vi.mock('@/lib/api', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))
vi.mock('@/stores/session', () => ({
  useSessionStore: (selector: (s: unknown) => unknown) =>
    selector({
      sessions: [
        { id: 's1', projectId: 'p1', title: 'Trip ideas', isFavorite: false, updatedAt: '2026-02-01T00:00:00Z' },
        { id: 's2', projectId: 'other', title: 'Not mine', isFavorite: false, updatedAt: '2026-03-01T00:00:00Z' },
      ],
      listSessions,
      createSession,
      resetPendingSessionCreate,
    }),
}))

import { ChatHome } from './ChatHome'

beforeEach(() => {
  navigate.mockReset()
  createSession.mockReset()
  resetPendingSessionCreate.mockReset()
  listSessions.mockReset()
  authFetch.mockReset()
})
afterEach(cleanup)

describe('ChatHome', () => {
  it('lists chat assistants, this project’s conversations and the chat workflows only', () => {
    render(<ChatHome projectId="p1" />)
    expect(screen.getByTestId('chat-agent-chat-assistant')).toBeTruthy()
    expect(screen.getByTestId('chat-agent-chat-tutor')).toBeTruthy()
    expect(screen.queryByTestId('chat-agent-planner')).toBeNull()
    expect(screen.getByText('Trip ideas')).toBeTruthy()
    expect(screen.queryByText('Not mine')).toBeNull()
    expect(screen.getByText('Décider')).toBeTruthy()
    expect(screen.queryByText('Default')).toBeNull()
    expect(listSessions).toHaveBeenCalledWith('p1')
  })

  it('starts a conversation with the default assistant without switching mode', async () => {
    createSession.mockResolvedValue({ id: 'new1', mode: 'chat-assistant' })
    render(<ChatHome projectId="p1" />)
    fireEvent.click(screen.getByTestId('chat-new-conversation'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/p1/s/new1'))
    expect(authFetch).not.toHaveBeenCalled()
    expect(resetPendingSessionCreate).toHaveBeenCalled()
  })

  it('picking an assistant creates the session then switches its mode', async () => {
    createSession.mockResolvedValue({ id: 'new2', mode: 'chat-assistant' })
    authFetch.mockResolvedValue({ ok: true })
    render(<ChatHome projectId="p1" />)
    fireEvent.click(screen.getByTestId('chat-agent-chat-tutor'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/p1/s/new2'))
    expect(authFetch).toHaveBeenCalledWith(
      '/api/sessions/new2/mode',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ mode: 'chat-tutor' }) }),
    )
  })

  it('shows the error and does not navigate when the mode switch is refused', async () => {
    createSession.mockResolvedValue({ id: 'new3', mode: 'chat-assistant' })
    authFetch.mockResolvedValue({ ok: false })
    render(<ChatHome projectId="p1" />)
    fireEvent.click(screen.getByTestId('chat-agent-chat-tutor'))
    await waitFor(() => expect(screen.getByText('Could not select this assistant')).toBeTruthy())
    expect(navigate).not.toHaveBeenCalled()
    expect(resetPendingSessionCreate).toHaveBeenCalled()
  })
})
