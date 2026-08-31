import type { LLMClientWithModel } from '../llm/client.js'
import type { StatsIdentity, Attachment } from '../../shared/types.js'
import type { ServerMessage } from '../../shared/protocol.js'
import type { SessionManager } from './index.js'
import type { ProviderManager } from '../provider-manager.js'
import { getEventStore } from '../events/index.js'
import { runChatTurn } from '../chat/orchestrator.js'
import { buildRunChatTurnParams } from '../utils/session-utils.js'
import { generateSessionNameForSession } from './name-generator.js'

import { createChatMessageMessage, createSessionRunningMessage, createPhaseChangedMessage } from '../ws/protocol.js'
import { finalizeTurnCompletion } from '../utils/session-utils.js'

const activeAgents = new Map<string, AbortController>()
const abortedSessions = new Set<string>()
// Tracks the in-flight turn's async completion (event appends, tool calls,
// and any chained follow-up turn) per session — see stopSessionExecution.
const turnCompletionPromises = new Map<string, Promise<void>>()

export interface ChatHandlerDeps {
  sessionManager: SessionManager
  providerManager: ProviderManager
  llmClient: LLMClientWithModel
  statsIdentity: StatsIdentity
  broadcastForSession: (sessionId: string, msg: ServerMessage) => void
}

export async function startChatSession(
  sessionId: string,
  content: string,
  deps: ChatHandlerDeps,
  options?: {
    attachments?: Attachment[]
    messageKind?: 'correction' | 'auto-prompt' | 'context-reset' | 'task-completed' | 'workflow-started' | 'command'
    isSystemGenerated?: boolean
  },
): Promise<void> {
  const { sessionManager, broadcastForSession } = deps

  const session = sessionManager.getSession(sessionId)
  if (!session) {
    throw new Error('Session not found')
  }

  const eventStore = getEventStore()

  // Check if session is already running
  if (session.isRunning) {
    throw new Error('Session is already running')
  }

  // Check if session is blocked - user intervention resets it
  if (session.phase === 'blocked') {
    sessionManager.setPhase(sessionId, 'build')
    broadcastForSession(sessionId, createPhaseChangedMessage('build'))
  }

  // Create AbortController
  const controller = new AbortController()
  const existingController = activeAgents.get(sessionId)
  if (existingController) {
    existingController.abort()
  }
  activeAgents.set(sessionId, controller)

  // Mark session as running
  sessionManager.setRunning(sessionId, true)
  broadcastForSession(sessionId, createSessionRunningMessage(true))

  try {
    // Add user message
    const userMessage = sessionManager.addMessage(sessionId, {
      role: 'user',
      content,
      ...(options?.attachments && { attachments: options.attachments }),
      ...(options?.messageKind && { messageKind: options.messageKind }),
      ...(options?.isSystemGenerated && { isSystemGenerated: options.isSystemGenerated }),
    })

    broadcastForSession(sessionId, createChatMessageMessage(userMessage))

    // Generate session name if needed (fire-and-forget)
    generateSessionNameForSession(
      sessionId,
      content,
      {
        sessionManager,
        providerManager: deps.providerManager,
        broadcastForSession,
        eventStore,
      },
      controller.signal,
    )

    // Start the chat turn
    startTurnWithCompletionChain(sessionId, controller, deps)
  } catch (error) {
    if (activeAgents.get(sessionId) === controller) {
      activeAgents.delete(sessionId)
    }
    try {
      sessionManager.setRunning(sessionId, false)
      broadcastForSession(sessionId, createSessionRunningMessage(false))
    } catch {
      // Session may have been deleted or invalidated
    }
    finalizeTurnCompletion(sessionId, sessionManager, broadcastForSession)
    throw error
  }
}

function startTurnWithCompletionChain(sessionId: string, controller: AbortController, deps: ChatHandlerDeps): void {
  const { sessionManager, llmClient, statsIdentity, broadcastForSession } = deps

  const chainPromise = runChatTurn(
    buildRunChatTurnParams({
      sessionManager,
      sessionId,
      llmClient,
      statsIdentity,
      signal: controller.signal,
      onMessage: (msg) => broadcastForSession(sessionId, msg),
    }),
  )
    .catch((error) => {
      if (error instanceof Error && error.message === 'Aborted') {
        return
      }
    })
    .finally(() => {
      if (activeAgents.get(sessionId) !== controller) {
        return
      }
      activeAgents.delete(sessionId)

      if (abortedSessions.has(sessionId)) {
        abortedSessions.delete(sessionId)
        sessionManager.clearMessageQueue(sessionId)
        finalizeTurnCompletion(sessionId, sessionManager, broadcastForSession)
        return
      }

      const completionMsgs = sessionManager.drainCompletionMessages(sessionId)
      const next = completionMsgs[0]
      if (next) {
        for (const remaining of completionMsgs.slice(1)) {
          sessionManager.queueMessage(sessionId, 'completion', remaining.content, remaining.attachments)
        }

        const userMessage = sessionManager.addMessage(sessionId, {
          role: 'user',
          content: next.content,
          ...(next.attachments ? { attachments: next.attachments } : {}),
        })
        broadcastForSession(sessionId, createChatMessageMessage(userMessage))

        const newController = new AbortController()
        activeAgents.set(sessionId, newController)
        startTurnWithCompletionChain(sessionId, newController, deps)
        return
      }

      sessionManager.clearMessageQueue(sessionId)
      finalizeTurnCompletion(sessionId, sessionManager, broadcastForSession)
    })

  turnCompletionPromises.set(sessionId, chainPromise)
}

export async function stopSessionExecution(sessionId: string, sessionManager: SessionManager): Promise<void> {
  abortedSessions.add(sessionId)
  const controller = activeAgents.get(sessionId)
  if (controller) {
    activeAgents.delete(sessionId)
    controller.abort()
  }

  // Release a paused gate immediately (setRunning(false) also clears it, but
  // this gives the UI instant feedback on Stop).
  sessionManager.clearPauseState(sessionId)
  sessionManager.setRunning(sessionId, false)

  // Abort is fire-and-forget from the turn's perspective — it only takes
  // effect once the turn next checks its signal. A caller that immediately
  // deletes the session (EventStore rows are FK-CASCADE'd to the sessions
  // row) can otherwise race an in-flight tool call/event append that hasn't
  // observed the abort yet, throwing a foreign-key error that's only ever
  // caught by the top-level unhandledRejection handler — silently dropping
  // the turn's last events. Wait for the turn to actually settle, bounded so
  // a turn that never reacts to the signal can't hang the caller forever.
  const pending = turnCompletionPromises.get(sessionId)
  if (pending) {
    await Promise.race([pending, new Promise<void>((resolve) => setTimeout(resolve, 5000))])
  }
}
