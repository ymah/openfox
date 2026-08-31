// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { authFetch } from '../../lib/api'

vi.mock('wouter', () => ({
  useRoute: () => [true, { projectId: 'proj-1', sessionId: 'session-1' }],
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

const useDisplaySettingsMock = vi.fn(() => ({
  showThinking: true,
  showVerboseToolOutput: true,
  showStats: true,
  showAgentDefinitions: true,
  showWorkflowBars: true,
  showSyntaxHighlighting: true,
  maxVisibleItems: 300,
}))

vi.mock('../../hooks/useDisplaySettings', () => ({
  useDisplaySettings: () => useDisplaySettingsMock(),
}))

const chatFeedItemsMock = vi.fn((_props: { displayItems: unknown[] }) => <div>ChatFeedItems</div>)
vi.mock('./ChatFeedItems', () => ({
  ChatFeedItems: (props: { displayItems: unknown[] }) => chatFeedItemsMock(props),
}))

vi.mock('../shared/Spinner', () => ({
  Spinner: () => <div>Loading...</div>,
}))

vi.mock('./groupMessages', () => ({
  groupMessages: (messages: unknown[]) => messages as { id: string; role: string }[],
}))

import { ReadonlySessionView } from './ReadonlySessionView'

describe('ReadonlySessionView — server-side truncation', () => {
  it('shows loading state on mount', () => {
    vi.mocked(authFetch).mockResolvedValue(new Response('{}', { status: 200 }))
    render(<ReadonlySessionView />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('displays hiddenCount from server response in the header', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: 'session-1', metadata: { title: 'Test' } },
          messages: [{ id: 'msg-1', role: 'user', content: 'Hi', timestamp: new Date().toISOString() }],
          hiddenCount: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(<ReadonlySessionView />)

    await waitFor(() => {
      expect(screen.getByText(/5 older hidden/)).toBeDefined()
    })
  })

  it('caps rendered items at maxVisibleItems, unlike the previous unbounded render', async () => {
    chatFeedItemsMock.mockClear()
    // mockReturnValue (not -Once): the component re-renders multiple times as
    // the fetch resolves, and every render must see the lowered cap.
    useDisplaySettingsMock.mockReturnValue({
      showThinking: true,
      showVerboseToolOutput: true,
      showStats: true,
      showAgentDefinitions: true,
      showWorkflowBars: true,
      showSyntaxHighlighting: true,
      maxVisibleItems: 3,
    })
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: `msg-${i}`,
      role: 'user',
      content: `message ${i}`,
      timestamp: new Date().toISOString(),
    }))

    vi.mocked(authFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: 'session-1', metadata: { title: 'Test' } },
          messages,
          hiddenCount: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    render(<ReadonlySessionView />)

    // maxVisibleItems is mocked to 3 — 5 messages in means only the last 3
    // reach ChatFeedItems, and the header reports the other 2 as hidden.
    await waitFor(() => {
      expect(screen.getByText(/2 older hidden/)).toBeDefined()
    })
    const lastCallProps = chatFeedItemsMock.mock.calls.at(-1)?.[0] as { displayItems: unknown[] }
    expect(lastCallProps.displayItems).toHaveLength(3)
  })
})
