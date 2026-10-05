import type { ProjectTask } from '../../shared/types.js'
import type { SessionManager } from '../session/index.js'
import type { TasksService } from './service.js'
import { logger } from '../utils/logger.js'
import { getSetting, setSetting } from '../db/settings.js'

/**
 * Traces a Build & Verify run on the project's task board, by the server rather than by the
 * agents: a model — a small local one especially — forgets an instruction like "keep the
 * board up to date", so the run opens a card when it starts working, closes it when it
 * succeeds and sends it back to To Do when it stops without finishing.
 *
 * Every board failure is swallowed: tracking must never be the reason a run breaks.
 */

/** The only workflow traced: the build loop. Audit, GTD, chat and custom workflows are not. */
export const TRACKED_WORKFLOW_ID = 'default'

const ACTOR_NAME = 'Build & Verify'
const FALLBACK_TITLE = 'Build & Verify run'

/** The part of the tasks service the tracker uses. */
export type TrackerService = Pick<TasksService, 'list' | 'get' | 'create' | 'move'>

/** Where the session → card correspondence is kept, so a resumed run finds its card again. */
export interface TrackerStore {
  get(sessionId: string): string | undefined
  set(sessionId: string, taskId: string): void
}

export interface TrackedRun {
  workflowId: string
  projectId: string
  sessionId: string
  title: string
  criteria: string[]
  /** False while the run only waits for the user's first choice: nothing is being worked on yet. */
  startsWork: boolean
}

export interface RunOutcome {
  type: string
  reason?: string
}

export interface TrackingHandle {
  /** The run ended (or paused) with this outcome. */
  finish(outcome: RunOutcome): Promise<void>
  /** The run threw: it was stopped, or failed. */
  fail(error: unknown): Promise<void>
}

const NOOP_HANDLE: TrackingHandle = { finish: async () => {}, fail: async () => {} }

/** First line = the card's title on the board; the criteria make the card a usable prompt if it is run again. */
export function buildTrackedTaskPrompt(title: string, criteria: string[]): string {
  const firstLine =
    title
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ''
  const head = firstLine || FALLBACK_TITLE
  if (criteria.length === 0) return head
  return `${head}\n\nAcceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}`
}

export function createWorkflowTracker(
  service: TrackerService,
  store: TrackerStore,
  log: { warn: (message: string, context?: Record<string, unknown>) => void } = logger,
) {
  const agent = { actor: 'agent' as const, actorName: ACTOR_NAME }

  async function safely(what: string, context: Record<string, unknown>, fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
    } catch (error) {
      log.warn(`Task board tracking failed: ${what}`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function begin(run: TrackedRun): Promise<TrackingHandle> {
    if (run.workflowId !== TRACKED_WORKFLOW_ID || !run.startsWork) return NOOP_HANDLE

    let task: ProjectTask | undefined
    await safely('start', { sessionId: run.sessionId }, async () => {
      const tasks = service.list(run.projectId)
      const mappedId = store.get(run.sessionId)
      const mapped = mappedId ? tasks.find((t) => t.id === mappedId) : undefined
      const bound = tasks.find((t) => t.status === 'in_progress' && t.activeSessionId === run.sessionId)

      // Someone else's card is already bound to this session (a run launched from the board):
      // it is theirs to move.
      if (bound && bound.id !== mapped?.id) return
      // The person finished it themselves: do not reopen it.
      if (mapped?.status === 'done') return

      let current = mapped
      if (!current) {
        current = service.create(run.projectId, { prompt: buildTrackedTaskPrompt(run.title, run.criteria) }, agent)
        store.set(run.sessionId, current.id)
      }
      if (current.status !== 'in_progress') {
        await service.move(run.projectId, current.id, 'in_progress', {
          ...agent,
          sessionId: run.sessionId,
          silent: true,
        })
      }
      task = current
    })

    if (!task) return NOOP_HANDLE
    const taskId = task.id
    const move = (to: 'todo' | 'done', reason?: string) =>
      service.move(run.projectId, taskId, to, { ...agent, silent: true, ...(reason ? { reason } : {}) })

    return {
      finish: (outcome) =>
        safely('finish', { sessionId: run.sessionId, outcome: outcome.type }, async () => {
          if (outcome.type === 'DONE') await move('done')
          else if (outcome.type === 'BLOCKED') await move('todo', `Run blocked: ${outcome.reason ?? 'no reason given'}`)
          // WAITING: the run is paused for the user, the card keeps showing it in progress.
        }),
      fail: (error) =>
        safely('interrupt', { sessionId: run.sessionId }, async () => {
          const message = error instanceof Error ? error.message : String(error)
          await move('todo', message === 'Aborted' ? 'Run stopped' : `Run failed: ${message}`)
        }),
    }
  }

  return { begin }
}

// ----------------------------------------------------------------------------
// Wiring to the running server
// ----------------------------------------------------------------------------

let service: TrackerService | null = null

/** Called once at startup with the same tasks service the `project_tasks` tool uses. */
export function setWorkflowTrackingService(next: TrackerService | null): void {
  service = next
}

/**
 * The session → card correspondence lives in the server settings, not in the session's metadata: the
 * metadata is shown to the person in the session sidebar (and listed to the agents), where an internal
 * card id has no place.
 */
const trackedKey = (sessionId: string) => `tracked_task.${sessionId}`

function settingsStore(): TrackerStore {
  return {
    get: (sessionId) => getSetting(trackedKey(sessionId)) ?? undefined,
    set: (sessionId, taskId) => setSetting(trackedKey(sessionId), taskId),
  }
}

/** Start tracking a workflow run; a no-op handle when the run is not one that is traced. */
export async function beginWorkflowTracking(args: {
  sessionManager: SessionManager
  sessionId: string
  workflowId: string
  /** True when the run proceeds past the entry step (resume, or an entry step that is not a user choice). */
  startsWork: boolean
}): Promise<TrackingHandle> {
  if (!service || args.workflowId !== TRACKED_WORKFLOW_ID || !args.startsWork) return NOOP_HANDLE
  try {
    const session = args.sessionManager.requireSession(args.sessionId)
    return await createWorkflowTracker(service, settingsStore()).begin({
      workflowId: args.workflowId,
      projectId: session.projectId,
      sessionId: args.sessionId,
      title: session.metadata?.title ?? '',
      criteria: (session.criteria ?? []).map((c) => c.description),
      startsWork: args.startsWork,
    })
  } catch (error) {
    logger.warn('Task board tracking failed: setup', {
      sessionId: args.sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NOOP_HANDLE
  }
}
