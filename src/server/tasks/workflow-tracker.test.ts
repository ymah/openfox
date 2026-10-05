import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildTrackedTaskPrompt,
  createWorkflowTracker,
  type TrackerService,
  type TrackerStore,
} from './workflow-tracker.js'
import type { ProjectTask } from '../../shared/types.js'

/** An in-memory board that follows the real service's rules closely enough to test the tracker. */
function makeBoard() {
  const tasks = new Map<string, ProjectTask>()
  const moves: { id: string; to: string; opts: Record<string, unknown> }[] = []
  let n = 0
  const service: TrackerService & { failMoveTo?: string } = {
    list: (projectId) => [...tasks.values()].filter((t) => t.projectId === projectId),
    get: (_projectId, id) => tasks.get(id) ?? null,
    create: (projectId, input) => {
      n += 1
      const task = {
        id: `t${n}`,
        projectId,
        prompt: input.prompt,
        status: 'todo',
        sessionIds: [],
      } as unknown as ProjectTask
      tasks.set(task.id, task)
      return task
    },
    move: async (_projectId, id, to, opts) => {
      moves.push({ id, to, opts: opts as unknown as Record<string, unknown> })
      if (service.failMoveTo === to) {
        const error = new Error('Gate blocked') as Error & { code: string }
        error.code = 'GATE_BLOCKED'
        throw error
      }
      const task = tasks.get(id)!
      task.status = to as ProjectTask['status']
      if (to === 'in_progress') task.activeSessionId = (opts as { sessionId?: string }).sessionId as string
      else delete (task as { activeSessionId?: string }).activeSessionId
      return { task }
    },
  }
  return { service, tasks, moves }
}

function makeStore(): TrackerStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, get: (sessionId) => data.get(sessionId), set: (sessionId, taskId) => void data.set(sessionId, taskId) }
}

const run = {
  workflowId: 'default',
  projectId: 'p1',
  sessionId: 's1',
  title: 'Add dark mode',
  criteria: ['Toggle exists', 'Choice is remembered'],
  startsWork: true,
}

describe('workflow run tracker', () => {
  let board: ReturnType<typeof makeBoard>
  let store: ReturnType<typeof makeStore>
  let warn: ReturnType<typeof vi.fn<(message: string, context?: Record<string, unknown>) => void>>
  let tracker: ReturnType<typeof createWorkflowTracker>

  beforeEach(() => {
    board = makeBoard()
    store = makeStore()
    warn = vi.fn<(message: string, context?: Record<string, unknown>) => void>()
    tracker = createWorkflowTracker(board.service, store, { warn })
  })

  it('puts a card In Progress, bound to the session, when the run starts working', async () => {
    await tracker.begin(run)

    const [task] = board.service.list('p1')
    expect(task?.status).toBe('in_progress')
    expect(task?.activeSessionId).toBe('s1')
    expect(task?.prompt.split('\n')[0]).toBe('Add dark mode')
    expect(task?.prompt).toContain('Toggle exists')
    expect(task?.prompt).toContain('Choice is remembered')
    expect(board.moves[0]?.opts).toMatchObject({
      actor: 'agent',
      actorName: 'Build & Verify',
      sessionId: 's1',
      silent: true,
    })
    expect(store.data.get('s1')).toBe(task?.id)
  })

  it('does nothing while the run waits for the user, or for another workflow', async () => {
    await tracker.begin({ ...run, startsWork: false })
    await tracker.begin({ ...run, workflowId: 'dev-audit' })
    expect(board.service.list('p1')).toHaveLength(0)
  })

  it('moves the card to Done when the run succeeds', async () => {
    const handle = await tracker.begin(run)
    await handle.finish({ type: 'DONE' })
    expect(board.service.list('p1')[0]?.status).toBe('done')
  })

  it('leaves the card where it is when the run only pauses for the user', async () => {
    const handle = await tracker.begin(run)
    await handle.finish({ type: 'WAITING', reason: 'user step' })
    expect(board.service.list('p1')[0]?.status).toBe('in_progress')
  })

  it('keeps the card In Progress for review when a required Done gate is not satisfied', async () => {
    board.service.failMoveTo = 'done'
    const handle = await tracker.begin(run)
    await expect(handle.finish({ type: 'DONE' })).resolves.toBeUndefined()
    expect(board.service.list('p1')[0]?.status).toBe('in_progress')
    expect(warn).toHaveBeenCalled()
  })

  it('sends the card back to To Do with the reason when the run is blocked', async () => {
    const handle = await tracker.begin(run)
    await handle.finish({ type: 'BLOCKED', reason: 'verification failed 3 times' })

    expect(board.service.list('p1')[0]?.status).toBe('todo')
    const back = board.moves.find((m) => m.to === 'todo')
    expect(String(back?.opts['reason'])).toContain('verification failed 3 times')
    expect(back?.opts).toMatchObject({ silent: true })
  })

  it('sends the card back to To Do when the run is stopped or fails', async () => {
    const stopped = await tracker.begin(run)
    await stopped.fail(new Error('Aborted'))
    expect(board.service.list('p1')[0]?.status).toBe('todo')
    expect(String(board.moves.at(-1)?.opts['reason'])).toMatch(/stopped/i)

    const other = createWorkflowTracker(makeBoard().service, makeStore(), { warn })
    const failed = await other.begin({ ...run, sessionId: 's2' })
    await failed.fail(new Error('LLM call failed'))
  })

  it('reuses the same card when a stopped run is resumed, instead of creating another', async () => {
    const first = await tracker.begin(run)
    await first.fail(new Error('Aborted'))
    expect(board.service.list('p1')[0]?.status).toBe('todo')

    await tracker.begin({ ...run, startsWork: true })

    const tasks = board.service.list('p1')
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.status).toBe('in_progress')
    expect(tasks[0]?.activeSessionId).toBe('s1')
  })

  it('creates a fresh card when the tracked one was deleted', async () => {
    await tracker.begin(run)
    board.tasks.clear()
    await tracker.begin(run)
    expect(board.service.list('p1')).toHaveLength(1)
  })

  it('leaves a card alone that the user already finished or that another flow bound to the session', async () => {
    const first = await tracker.begin(run)
    await first.finish({ type: 'DONE' })
    await tracker.begin(run)
    expect(board.service.list('p1')).toHaveLength(1)
    expect(board.service.list('p1')[0]?.status).toBe('done')

    // A run launched from a task: its card is bound to the session already — hands off.
    const board2 = makeBoard()
    const own = board2.service.create('p1', { prompt: 'Started from the board' }, { actor: 'human' })
    own.status = 'in_progress'
    own.activeSessionId = 's9'
    const tracker2 = createWorkflowTracker(board2.service, makeStore(), { warn })
    const handle = await tracker2.begin({ ...run, sessionId: 's9' })
    await handle.finish({ type: 'DONE' })
    expect(board2.service.list('p1')).toHaveLength(1)
    expect(board2.service.list('p1')[0]?.status).toBe('in_progress')
  })

  it('never lets a board failure break the run', async () => {
    const broken: TrackerService = {
      list: () => {
        throw new Error('db down')
      },
      get: () => null,
      create: () => {
        throw new Error('db down')
      },
      move: async () => {
        throw new Error('db down')
      },
    }
    const safe = createWorkflowTracker(broken, makeStore(), { warn })
    const handle = await safe.begin(run)
    await expect(handle.finish({ type: 'DONE' })).resolves.toBeUndefined()
    await expect(handle.fail(new Error('x'))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})

describe('buildTrackedTaskPrompt', () => {
  it('starts with the title and lists the criteria so the card can be run again', () => {
    expect(buildTrackedTaskPrompt('Fix login', ['A', 'B'])).toBe('Fix login\n\nAcceptance criteria:\n- A\n- B')
  })

  it('is just the title when there are no criteria, and never empty', () => {
    expect(buildTrackedTaskPrompt('Fix login', [])).toBe('Fix login')
    expect(buildTrackedTaskPrompt('  ', [])).toBe('Build & Verify run')
  })

  it('keeps only the first line of a long multi-line title', () => {
    expect(buildTrackedTaskPrompt('Line one\nline two', []).split('\n')[0]).toBe('Line one')
  })
})
