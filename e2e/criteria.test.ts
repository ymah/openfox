/**
 * Criteria System E2E Tests
 *
 * Tests criterion CRUD operations and status transitions via session_metadata tool.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  createTestClient,
  createTestProject,
  createTestServer,
  collectChatEvents,
  assertNoErrors,
  createProject,
  createSession,
  setSessionCriteria,
  setSessionMode,
  type TestClient,
  type TestProject,
  type TestServerHandle,
} from './utils/index.js'

function getCriteria(session: { metadataEntries?: Record<string, unknown[]> } | null): unknown[] {
  return session?.metadataEntries?.['criteria'] ?? []
}

describe('Criteria System', () => {
  let server: TestServerHandle
  let client: TestClient
  let testDir: TestProject

  beforeAll(async () => {
    server = await createTestServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    client = await createTestClient({ url: server.wsUrl })
    testDir = await createTestProject({ template: 'typescript' })

    const restProject = await createProject(server.url, { name: 'Criteria Test', workdir: testDir.path })
    const restSession = await createSession(server.url, { projectId: restProject.id })
    await client.send('session.load', { sessionId: restSession.id })
  })

  afterEach(async () => {
    await client.close()
    await testDir.cleanup()
  })

  describe('Planner Criteria Tools', () => {
    describe('add_criterion', () => {
      it('adds a criterion with auto-generated ID', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion using the session_metadata tool with action "add".',
        })

        const events = await collectChatEvents(client)
        assertNoErrors(events)

        const session = client.getSession()!
        const criteria = getCriteria(session)
        expect(criteria.length).toBe(1)

        const criterion = criteria[0] as { id: string; description: string; status: string }
        expect(criterion.id).toBe('1')
        expect(criterion.description).toBe('Test criterion')
        expect(criterion.status).toBe('pending')
      })

      it('adds multiple criteria with auto-incrementing IDs', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion using the session_metadata tool with action "add".',
        })
        await client.waitForChatDone()

        await client.send('chat.send', {
          content: 'Add another criterion using the session_metadata tool with action "add".',
        })
        await client.waitForChatDone()

        const session = client.getSession()!
        const criteria = getCriteria(session)
        expect(criteria.length).toBe(2)
        const c0 = criteria[0] as { id: string }
        const c1 = criteria[1] as { id: string }
        expect(c0.id).toBe('1')
        expect(c1.id).toBe('2')
      })

      it('emits metadata.updated event', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion with description "Testing events". Use session_metadata tool.',
        })

        const events = await collectChatEvents(client)
        const metadataEvents = events.get('metadata.updated')

        expect(metadataEvents.length).toBeGreaterThan(0)
      })
    })

    describe('get_criteria', () => {
      it('returns current criteria list', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion with description "For testing get".',
        })
        await client.waitForChatDone()

        await client.send('chat.send', {
          content: 'Show the current criteria.',
        })

        await client.waitForChatDone()

        await new Promise((r) => setTimeout(r, 100))

        const allEvents = client.allEvents()
        const toolCallEvents = allEvents.filter((e) => e.type === 'chat.tool_call')
        const getCriteriaCall = toolCallEvents.find((e) => {
          const payload = e.payload as any
          return (
            payload.tool === 'session_metadata' && payload.args?.action === 'get' && payload.args?.key === 'criteria'
          )
        })
        expect(getCriteriaCall).toBeDefined()

        const resultEvent = allEvents.find(
          (e) =>
            e.type === 'chat.tool_result' && (e.payload as any).callId === (getCriteriaCall!.payload as any).callId,
        )
        expect(resultEvent).toBeDefined()
        expect((resultEvent!.payload as any).result.success).toBe(true)
      })
    })

    describe('update_criterion', () => {
      it('updates criterion description', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion with description "Original description".',
        })
        await client.waitForChatDone()

        await client.send('chat.send', {
          content:
            'Use session_metadata with action "update" to change the first criterion (ID "1") description to "Updated description".',
        })

        await client.waitForChatDone()

        await new Promise((r) => setTimeout(r, 100))

        const session = client.getSession()!
        const criteria = getCriteria(session) as Array<{ id: string; description: string }>
        const criterion = criteria.find((c: { id: string }) => c.id === '1')
        expect(criterion?.description).toContain('Updated')
      })
    })

    describe('remove_criterion', () => {
      it('removes a criterion by ID', async () => {
        await client.send('chat.send', {
          content: 'Add a criterion with description "Will be removed".',
        })
        await client.waitForChatDone()

        await new Promise((r) => setTimeout(r, 100))
        expect(getCriteria(client.getSession()!).length).toBe(1)

        await client.send('chat.send', {
          content: 'Use session_metadata with action "remove" to remove the first criterion (ID "1").',
        })

        await client.waitForChatDone()

        await new Promise((r) => setTimeout(r, 100))

        const session = client.getSession()!
        expect(getCriteria(session).length).toBe(0)
      })
    })
  })

  describe('Builder Criteria Tools', () => {
    beforeEach(async () => {
      const sessionId = client.getSession()!.id

      await client.send('chat.send', {
        content: 'Add a criterion with description "A new file utils.ts exists".',
      })
      await client.waitForChatDone()

      await new Promise((r) => setTimeout(r, 100))

      await setSessionMode(server.url, sessionId, 'builder', server.wsUrl)
      await new Promise((r) => setTimeout(r, 50))
    })

    describe('complete_criterion', () => {
      it('marks criterion as completed', async () => {
        await client.send('chat.send', {
          content:
            'Create the file src/utils.ts with any content, then call session_metadata with action "update" and status "completed" for the first criterion (ID "1").',
        })

        await collectChatEvents(client)

        await new Promise((r) => setTimeout(r, 100))

        const allEvents = client.allEvents()
        const metadataEvents = allEvents.filter((e) => e.type === 'metadata.updated')
        expect(metadataEvents.length).toBeGreaterThan(0)

        const session = client.getSession()!
        const criteria = getCriteria(session) as Array<{ id: string; status: string }>
        const criterion = criteria[0]!
        expect(criterion.status).toBe('completed')
      })
    })
  })

  describe('Verifier Criteria Tools', () => {
    it.skip('passes a completed criterion during verification', async () => {
      const session = client.getSession()!
      expect(getCriteria(session).length).toBe(0)
    })
  })

  describe('Manual Criteria Edit', () => {
    it('allows direct criteria editing via criteria.edit', async () => {
      await client.send('chat.send', {
        content: 'Add a criterion with description "Initial".',
      })
      await client.waitForChatDone()

      const newCriteria: Array<{ id: string; description: string; status: { type: string }; attempts: unknown[] }> = [
        {
          id: '0',
          description: 'Completely replaced criterion',
          status: { type: 'pending' },
          attempts: [],
        },
        {
          id: '1',
          description: 'Another replaced criterion',
          status: { type: 'pending' },
          attempts: [],
        },
      ]

      const session = client.getSession()!
      await setSessionCriteria(server.url, session.id, newCriteria)

      await client.send('session.load', { sessionId: session.id })
      await client.waitFor('session.state')

      const updatedSession = client.getSession()!
      const criteria = getCriteria(updatedSession)
      expect(criteria.length).toBe(2)
      const c0 = criteria[0] as { id: string }
      expect(c0.id).toBe('0')
    })
  })

  describe('Status Transitions', () => {
    it.skip('transitions: pending → in_progress → completed', async () => {
      const session = client.getSession()!
      expect(getCriteria(session).length).toBe(0)
    })
  })

  describe('Criterion Persistence', () => {
    it('preserves criteria across session loads', async () => {
      await client.send('chat.send', {
        content: 'Add a criterion with description "Should persist".',
      })
      await client.waitForChatDone()

      const sessionId = client.getSession()!.id

      const client2 = await createTestClient({ url: server.wsUrl })
      try {
        await client2.send('session.load', { sessionId })

        const session = client2.getSession()!
        const criteria = getCriteria(session)
        expect(criteria.length).toBe(1)
        const c0 = criteria[0] as { id: string }
        expect(c0.id).toBe('1')
      } finally {
        await client2.close()
      }
    })
  })

  describe('Mode Switch', () => {
    it('clears cached prompt when mode changes, ensuring new agent tools work', async () => {
      const sessionId = client.getSession()!.id

      // First: in planner mode, add a criterion
      await client.send('chat.send', {
        content:
          'Add a criterion using session_metadata with action "add", key "criteria", and description "Test criterion 1".',
      })
      await client.waitForChatDone()

      let session = client.getSession()!
      let criteria = getCriteria(session)
      expect(criteria.length).toBeGreaterThanOrEqual(1)

      // Switch mode from planner to builder
      await setSessionMode(server.url, sessionId, 'builder', server.wsUrl)
      await new Promise((r) => setTimeout(r, 100))

      // Second: in builder mode, add another criterion
      // This should work correctly with the builder's tools
      // (previously would fail due to stale cached prompt with planner tools)
      await client.send('chat.send', {
        content:
          'Add a criterion using session_metadata with action "add", key "criteria", and description "Test criterion 2".',
      })
      await client.waitForChatDone()

      session = client.getSession()!
      criteria = getCriteria(session)
      // Verify that we have at least 2 criteria and can still use session_metadata
      expect(criteria.length).toBeGreaterThanOrEqual(2)
    })
  })
})
