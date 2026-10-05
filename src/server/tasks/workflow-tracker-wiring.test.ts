import { afterEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({ store: new Map<string, string>() }))
vi.mock('../db/settings.js', () => ({
  getSetting: (key: string) => settings.store.get(key) ?? null,
  setSetting: (key: string, value: string) => void settings.store.set(key, value),
}))

import { beginWorkflowTracking, setWorkflowTrackingService, type TrackerService } from './workflow-tracker.js'
import type { ProjectTask } from '../../shared/types.js'
import type { SessionManager } from '../session/index.js'

function board() {
  const tasks = new Map<string, ProjectTask>()
  const service: TrackerService = {
    list: () => [...tasks.values()],
    get: (_p, id) => tasks.get(id) ?? null,
    create: (projectId, input) => {
      const task = { id: 't1', projectId, prompt: input.prompt, status: 'todo' } as unknown as ProjectTask
      tasks.set(task.id, task)
      return task
    },
    move: async (_p, id, to, opts) => {
      const task = tasks.get(id)!
      task.status = to as ProjectTask['status']
      if (to === 'in_progress') task.activeSessionId = (opts as { sessionId?: string }).sessionId as string
      return { task }
    },
  }
  return { tasks, service }
}

function sessionManager(setMetadataEntries = vi.fn()) {
  return {
    setMetadataEntries,
    requireSession: () => ({ projectId: 'p1', metadata: { title: 'Add search' }, criteria: [], metadataEntries: {} }),
  } as unknown as SessionManager
}

afterEach(() => {
  setWorkflowTrackingService(null)
  settings.store.clear()
})

describe('beginWorkflowTracking', () => {
  it('remembers the card of a session in the server settings and writes nothing into the session metadata', async () => {
    const { service, tasks } = board()
    setWorkflowTrackingService(service)
    const setMetadataEntries = vi.fn()

    await beginWorkflowTracking({
      sessionManager: sessionManager(setMetadataEntries),
      sessionId: 's1',
      workflowId: 'default',
      startsWork: true,
    })

    expect(tasks.size).toBe(1)
    expect(settings.store.get('tracked_task.s1')).toBe('t1')
    // The session sidebar lists every metadata key: an internal card id must not show up there.
    expect(setMetadataEntries).not.toHaveBeenCalled()
  })

  it('does nothing without a service, for another workflow, or before the run works', async () => {
    const { service, tasks } = board()
    await beginWorkflowTracking({
      sessionManager: sessionManager(),
      sessionId: 's1',
      workflowId: 'default',
      startsWork: true,
    })
    setWorkflowTrackingService(service)
    await beginWorkflowTracking({
      sessionManager: sessionManager(),
      sessionId: 's1',
      workflowId: 'dev-audit',
      startsWork: true,
    })
    await beginWorkflowTracking({
      sessionManager: sessionManager(),
      sessionId: 's1',
      workflowId: 'default',
      startsWork: false,
    })
    expect(tasks.size).toBe(0)
  })
})
