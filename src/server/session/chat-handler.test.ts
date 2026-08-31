import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionManager } from './index.js'

const { runChatTurnMock, generateSessionNameMock } = vi.hoisted(() => ({
  runChatTurnMock: vi.fn(),
  generateSessionNameMock: vi.fn(),
}))

vi.mock('../chat/orchestrator.js', () => ({
  runChatTurn: runChatTurnMock,
}))

vi.mock('./name-generator.js', () => ({
  generateSessionNameForSession: generateSessionNameMock,
}))

vi.mock('../events/index.js', () => ({
  getEventStore: () => ({}),
}))

import { startChatSession, stopSessionExecution } from './chat-handler.js'

function createSessionManager(): SessionManager {
  let isRunning = false
  return {
    getSession: vi.fn(() => ({ id: 'session-1', isRunning, phase: 'build' })),
    setRunning: vi.fn((_id: string, value: boolean) => {
      isRunning = value
    }),
    addMessage: vi.fn((_id: string, msg: unknown) => ({ id: 'msg-1', ...(msg as object) })),
    setPhase: vi.fn(),
    getContextState: vi.fn(() => ({ currentTokens: 0, maxTokens: 1000 })),
    clearMessageQueue: vi.fn(),
    drainCompletionMessages: vi.fn(() => []),
  } as unknown as SessionManager
}

describe('stopSessionExecution', () => {
  beforeEach(() => {
    runChatTurnMock.mockReset()
    generateSessionNameMock.mockReset()
  })

  it('waits for the in-flight turn to actually settle before resolving', async () => {
    let releaseTurn: () => void = () => {}
    const turnHeld = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    runChatTurnMock.mockReturnValue(turnHeld)

    const sessionManager = createSessionManager()
    const deps = {
      sessionManager,
      providerManager: {} as never,
      llmClient: {} as never,
      statsIdentity: {} as never,
      broadcastForSession: vi.fn(),
    }

    await startChatSession('session-1', 'hello', deps)

    let stopResolved = false
    const stopPromise = stopSessionExecution('session-1', sessionManager).then(() => {
      stopResolved = true
    })

    // The turn hasn't settled yet — stopSessionExecution must still be pending.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(stopResolved).toBe(false)

    releaseTurn()
    await stopPromise
    expect(stopResolved).toBe(true)
  })

  it('resolves promptly when there is no in-flight turn for the session', async () => {
    const sessionManager = createSessionManager()
    await expect(stopSessionExecution('idle-session', sessionManager)).resolves.toBeUndefined()
  })
})
