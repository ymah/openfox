import type { LLMClientWithModel } from '../llm/client.js'
import type { ProviderManager } from '../provider-manager.js'
import type { SessionManager } from '../session/manager.js'
import { logger } from '../utils/logger.js'
import type { ServerMessage } from '../../shared/protocol.js'
import { createSessionRunningMessage, createChatMessageMessage } from '../ws/protocol.js'
import { finalizeTurnCompletion, buildRunChatTurnParams } from '../utils/session-utils.js'
import { generateSessionNameForSession } from '../session/name-generator.js'
import { getEventStore } from '../events/index.js'

type QueuedMessageKind = NonNullable<Parameters<SessionManager['addMessage']>[1]['messageKind']>

interface QueueProcessorDeps {
  sessionManager: SessionManager
  providerManager: ProviderManager
  getLLMClient: () => LLMClientWithModel
  getLLMClientForProvider?: (
    providerId: string,
    model: string,
    reasoningEffort?: string,
  ) => LLMClientWithModel | undefined
  getActiveProvider: (() => import('../../shared/types.js').Provider | undefined) | undefined
  /** Re-dispatch a queued 'workflow-launch' entry as a real workflow run. */
  launchWorkflow?: (sessionId: string, launch: import('../runner/launch.js').WorkflowLaunchPayload) => void
  broadcastForSession: (sessionId: string, msg: ServerMessage) => void
}

export class QueueProcessor {
  private deps: QueueProcessorDeps
  private unsubscribe: (() => void) | null = null
  private activeAgents = new Map<string, AbortController>()
  private abortedSessions = new Set<string>()
  private turnPromises = new Map<string, Promise<void>>()

  constructor(deps: QueueProcessorDeps) {
    this.deps = deps
  }

  start(): void {
    if (this.unsubscribe) {
      logger.warn('QueueProcessor already started')
      return
    }

    this.unsubscribe = this.deps.sessionManager.subscribe((event) => {
      if (event.type === 'queue_added') {
        this.handleQueueAdded(event.sessionId)
      } else if (event.type === 'running_changed' && !event.isRunning) {
        this.handleTurnDone(event.sessionId)
      }
    })

    logger.debug('QueueProcessor started')
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }

    for (const controller of this.activeAgents.values()) {
      controller.abort()
    }
    this.activeAgents.clear()

    logger.debug('QueueProcessor stopped')
  }

  abortSession(sessionId: string): boolean {
    this.deps.sessionManager.clearPauseState(sessionId)
    const controller = this.activeAgents.get(sessionId)
    if (controller) {
      // Only flag the session as aborted when a turn actually exists — a stale
      // marker would make the next turn's cleanup drop its queue. The
      // controller stays registered so the turn's own finally still owns it.
      this.abortedSessions.add(sessionId)
      controller.abort()
      return true
    }
    return false
  }

  /**
   * Promise that settles once the in-flight turn for `sessionId` (if any) has
   * fully wound down — used by session deletion to avoid cascading while the
   * orchestrator is still appending events.
   */
  waitForTurn(sessionId: string): Promise<void> {
    return this.turnPromises.get(sessionId) ?? Promise.resolve()
  }

  private handleQueueAdded(sessionId: string): void {
    const { sessionManager } = this.deps
    const session = sessionManager.getSession(sessionId)
    if (!session) return

    if (session.isRunning) {
      logger.debug('Session is running, not starting new turn', { sessionId })
      return
    }

    if (!sessionManager.hasQueuedMessages(sessionId)) {
      logger.debug('No queued messages', { sessionId })
      return
    }

    this.startTurn(sessionId)
  }

  private handleTurnDone(sessionId: string): void {
    logger.debug('Turn done, checking for more queued messages', { sessionId })

    const { sessionManager } = this.deps

    if (!sessionManager.hasQueuedMessages(sessionId)) {
      logger.debug('No more queued messages', { sessionId })
      return
    }

    this.startTurn(sessionId)
  }

  private startTurn(sessionId: string): void {
    const { sessionManager, broadcastForSession } = this.deps
    logger.info('Starting turn from queue processor', { sessionId })

    const session = sessionManager.getSession(sessionId)
    if (!session || session.isRunning) {
      logger.warn('Cannot start turn: session not found or already running', { sessionId })
      return
    }

    const queue = sessionManager.getQueueState(sessionId)
    if (queue.length === 0) {
      logger.warn('Cannot start turn: queue is empty', { sessionId })
      return
    }

    // A new queued turn (user message, slash command, auto-prompt, or
    // completion) on a session with a blocked workflow execution abandons that
    // workflow: the step can no longer be retried, so clear it (execution +
    // phase) instead of leaving the stale "Retry step" affordance pinned while
    // the turn runs.
    const latestExec = sessionManager.getLatestWorkflowExecution(sessionId)
    if (latestExec && latestExec.status === 'blocked') {
      logger.info('Cancelling blocked workflow execution before chat turn', {
        sessionId,
        executionId: latestExec.id,
        step: latestExec.currentStepId,
      })
      sessionManager.cancelWorkflow(
        sessionId,
        latestExec.id,
        latestExec.workflowId,
        latestExec.workflowName,
        latestExec.workflowColor,
      )
    }

    const nextAsap = queue.find((m) => m.mode === 'asap') ?? queue[0]

    // A workflow launch queued while the session was busy is re-dispatched as
    // a real run (the runner owns the running state and the user message).
    if (nextAsap?.messageKind === 'workflow-launch' && nextAsap.workflowLaunch && this.deps.launchWorkflow) {
      sessionManager.cancelQueuedMessage(sessionId, nextAsap.queueId)
      const { scope, ...rest } = nextAsap.workflowLaunch
      this.deps.launchWorkflow(sessionId, {
        ...rest,
        ...(scope ? { scope: scope as NonNullable<import('../runner/launch.js').WorkflowLaunchPayload['scope']> } : {}),
        ...(nextAsap.content ? { content: nextAsap.content } : {}),
        ...(nextAsap.attachments ? { attachments: nextAsap.attachments } : {}),
      })
      return
    }

    const controller = new AbortController()
    // Any aborted marker belongs to the previous turn, which no longer owns
    // this session — it must not make this fresh turn drop its queue.
    this.abortedSessions.delete(sessionId)
    this.activeAgents.set(sessionId, controller)

    sessionManager.setRunning(sessionId, true)
    broadcastForSession(sessionId, createSessionRunningMessage(true))

    if (nextAsap) {
      sessionManager.cancelQueuedMessage(sessionId, nextAsap.queueId)
      const userMessage = sessionManager.addMessage(sessionId, {
        role: 'user',
        content: nextAsap.content,
        ...(nextAsap.attachments ? { attachments: nextAsap.attachments } : {}),
        ...(nextAsap.messageKind ? { messageKind: nextAsap.messageKind as QueuedMessageKind } : {}),
      })
      broadcastForSession(sessionId, createChatMessageMessage(userMessage))
      logger.debug('Added queued message to session', {
        sessionId,
        queueId: nextAsap.queueId,
        messageId: userMessage.id,
      })

      generateSessionNameForSession(
        sessionId,
        nextAsap.content,
        {
          sessionManager,
          providerManager: this.deps.providerManager,
          broadcastForSession,
          eventStore: getEventStore(),
          getLLMClient: this.deps.getLLMClient,
          ...(this.deps.getLLMClientForProvider ? { getLLMClientForProvider: this.deps.getLLMClientForProvider } : {}),
        },
        controller.signal,
      )
    }

    const turnPromise = this.runTurn(sessionId, controller)
      .catch((error) => {
        // Pre-flight (provider activation, client resolution, dynamic import)
        // threw before runChatTurn took over. Without this the session would
        // stay is_running=true forever with no signal to the client.
        logger.error('QueueProcessor pre-flight error', { sessionId, error })
        broadcastForSession(sessionId, {
          type: 'chat.error',
          payload: { error: error instanceof Error ? error.message : String(error), recoverable: true },
        } as ServerMessage)
        this.finishTurn(sessionId, controller)
      })
      .finally(() => {
        if (this.turnPromises.get(sessionId) === turnPromise) this.turnPromises.delete(sessionId)
      })
    this.turnPromises.set(sessionId, turnPromise)
  }

  /**
   * Turn wind-down shared by the normal completion path and the pre-flight
   * failure path. Guarded by controller identity: a Stop followed by an
   * immediate new message starts turn B before turn A's finally runs, and A
   * must not clobber B's controller or running state.
   */
  private finishTurn(sessionId: string, controller: AbortController): void {
    const { sessionManager, broadcastForSession } = this.deps
    if (this.activeAgents.get(sessionId) !== controller) {
      return
    }
    this.activeAgents.delete(sessionId)

    try {
      const session = sessionManager.getSession(sessionId)
      if (!session) {
        // Session was deleted — nothing more to clean up
        return
      }

      if (this.abortedSessions.has(sessionId)) {
        this.abortedSessions.delete(sessionId)
        finalizeTurnCompletion(sessionId, sessionManager, broadcastForSession)
        return
      }

      const hasMore = sessionManager.hasQueuedMessages(sessionId)
      if (!hasMore) {
        finalizeTurnCompletion(sessionId, sessionManager, broadcastForSession)
        return
      }

      // Safety: orchestrator only appends running.changed to event store;
      // ensure running state is reset before starting next turn
      if (session.isRunning) {
        sessionManager.setRunning(sessionId, false)
      }
      this.startTurn(sessionId)
    } catch (error) {
      logger.error('Error in turn completion cleanup', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async runTurn(sessionId: string, controller: AbortController): Promise<void> {
    const { sessionManager, getLLMClient, getActiveProvider, broadcastForSession, providerManager } = this.deps

    // Activate the session's EFFECTIVE provider/model (agent override > session
    // preference > default), not the raw stored preference — otherwise the
    // runtime client would be wrong on an override agent, or a stale override
    // would linger after switching back to a non-override agent.
    const effective = sessionManager.resolveEffectiveProviderModel(sessionId)
    if (effective.providerId && effective.model) {
      const currentActiveProviderId = providerManager.getActiveProviderId()
      const currentModel = providerManager.getCurrentModel()

      if (currentActiveProviderId !== effective.providerId || currentModel !== effective.model) {
        logger.info('Switching to session effective provider', {
          sessionId,
          fromProvider: currentActiveProviderId,
          fromModel: currentModel,
          toProvider: effective.providerId,
          toModel: effective.model,
        })
        const result = await providerManager.activateProvider(effective.providerId, { model: effective.model })
        if (!result.success) {
          logger.error('Failed to activate session provider', { sessionId, error: result.error })
        }
      }
    }

    const llmClient = getLLMClient()
    const provider = getActiveProvider?.()

    // Re-resolve the session's LLM client for each retry attempt so a provider
    // switch made mid-turn (e.g. during backoff) takes effect on the next attempt.
    // The session/agent reasoning effort is passed through so the request and
    // the stats identity carry it.
    const getSessionLLMClient = (): LLMClientWithModel => {
      const current = sessionManager.resolveEffectiveProviderModel(sessionId)
      if (current.providerId && current.model && this.deps.getLLMClientForProvider) {
        const resolvedModel = providerManager.resolveModel?.(current.providerId, current.model)
        const effectiveModel = resolvedModel ?? current.model
        const client = this.deps.getLLMClientForProvider(current.providerId, effectiveModel, current.reasoningEffort)
        if (client) return client
      }
      return llmClient
    }

    // Run the turn on the session-aware client (not the global one) so the
    // reasoning effort actually sent is the session's, and matches the stats.
    const sessionClient = getSessionLLMClient()
    const sessionEffort = sessionClient.getReasoningEffort?.()

    const statsIdentity = {
      providerId: provider?.id ?? `provider:${sessionClient.getModel()}`,
      providerName: provider?.name ?? 'Unknown Provider',
      backend: provider?.backend ?? sessionClient.getBackend(),
      model: sessionClient.getModel(),
      ...(sessionEffort ? { reasoningEffort: sessionEffort } : {}),
    }

    const { runChatTurn } = await import('../chat/orchestrator.js')

    const runChatTurnParams = buildRunChatTurnParams({
      sessionManager,
      sessionId,
      llmClient: sessionClient,
      getSessionLLMClient,
      statsIdentity,
      signal: controller.signal,
      onMessage: (msg) => broadcastForSession(sessionId, msg),
    })

    await runChatTurn(runChatTurnParams)
      .catch((error) => {
        if (error instanceof Error && error.message === 'Aborted') {
          return
        }
        logger.error('QueueProcessor turn error', { sessionId, error })
      })
      .finally(() => {
        this.finishTurn(sessionId, controller)
      })
  }
}
