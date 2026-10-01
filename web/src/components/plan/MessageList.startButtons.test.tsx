// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MessageList } from './MessageList'

// The "start building" buttons that appear once acceptance criteria are written:
// one per workflow, but only the project's own.
const project = { type: 'dev' as string | undefined }

vi.mock('../../stores/session', () => ({
  useSessionStore: (selector: (state: unknown) => unknown) =>
    selector({
      currentSession: {
        id: 's1',
        phase: 'plan',
        criteria: [],
        metadata: {},
        metadataEntries: { criteria: [{ id: 'c1', description: 'x', status: 'pending' }] },
      },
      panes: {},
      focusedSessionId: null,
      messages: [],
      hiddenCount: 0,
      error: null,
      clearError: vi.fn(),
    }),
  useIsRunning: () => false,
}))

vi.mock('../../hooks/useWorkflows', () => ({
  useWorkflows: () => ({
    workflows: [
      { id: 'default', name: 'Build & Verify', color: '#3b82f6' },
      { id: 'chat-decide', name: 'Chat — Décider', color: '#f97316', category: 'chat' },
      { id: 'gtd-build', name: 'GTD — Build', color: '#0ea5e9', category: 'gtd' },
    ],
    refresh: vi.fn(),
  }),
}))

vi.mock('../../hooks/useCurrentProject', () => ({
  useCurrentProject: () => (project.type === undefined ? undefined : { id: 'p1', name: 'P', type: project.type }),
}))

vi.mock('../../hooks/useSessionWorkdir', () => ({ useSessionWorkdir: () => '/tmp' }))

vi.mock('../../hooks/useDisplaySettings', () => ({
  useDisplaySettings: () => ({
    showThinking: true,
    showVerboseToolOutput: true,
    showStats: true,
    showAgentDefinitions: true,
    showWorkflowBars: true,
  }),
}))

vi.mock('./ChatFeedItems', () => ({ ChatFeedItems: () => <div>ChatFeedItems</div> }))

const assistantItem = {
  type: 'message',
  message: { id: 'a1', role: 'assistant', content: 'plan ready', timestamp: '2026-01-01T00:00:00Z' },
}

function renderList() {
  return render(
    <MessageList
      displayItems={[assistantItem] as never}
      scrollContainerRef={{ current: { osInstance: () => null, getElement: () => null } }}
      highlightedMessageId={null}
      onLaunchWorkflow={vi.fn()}
    />,
  )
}

describe('MessageList start buttons', () => {
  afterEach(() => {
    cleanup()
    project.type = 'dev'
  })

  it('a dev project offers only dev workflows, never the chat or GTD ones', () => {
    renderList()
    expect(screen.getByText(/Build & Verify/)).toBeDefined()
    expect(screen.queryByText(/Chat — Décider/)).toBeNull()
    expect(screen.queryByText(/GTD — Build/)).toBeNull()
  })

  it('a chat project offers its own workflows and not the dev one', () => {
    project.type = 'chat'
    renderList()
    expect(screen.getByText(/Chat — Décider/)).toBeDefined()
    expect(screen.queryByText(/GTD — Build/)).toBeNull()
  })
})
