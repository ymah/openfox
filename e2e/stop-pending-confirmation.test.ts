/**
 * Stopping a session that is waiting on a path confirmation must settle that
 * confirmation everywhere: announced to the clients (so the card disappears), and
 * recorded as answered (so it does not come back on reload nor keep the session
 * flagged as "waiting").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  createTestClient,
  createTestProject,
  createTestServer,
  createProject,
  createSession,
  setSessionMode,
  stopSessionChat,
  type TestClient,
  type TestProject,
  type TestServerHandle,
} from './utils/index.js'

describe('Stop while a path confirmation is pending', () => {
  let server: TestServerHandle
  let client: TestClient
  let project: TestProject
  let sessionId: string

  beforeAll(async () => {
    server = await createTestServer()
  })
  afterAll(async () => {
    await server.close()
  })
  beforeEach(async () => {
    client = await createTestClient({ url: server.wsUrl })
    project = await createTestProject({ template: 'typescript' })
    const restProject = await createProject(server.url, { name: 'Stop Confirmation', workdir: project.path })
    sessionId = (await createSession(server.url, { projectId: restProject.id })).id
    await client.send('session.load', { sessionId })
    await setSessionMode(server.url, sessionId, 'builder', server.wsUrl)
  })
  afterEach(async () => {
    await client.close()
    await project.cleanup()
  })

  const pendingOf = async () => {
    const data = (await (await fetch(`${server.url}/api/sessions/${sessionId}`)).json()) as {
      pendingConfirmations?: unknown[]
    }
    return data.pendingConfirmations ?? []
  }

  it('announces the cancellation and does not bring the confirmation back on reload', async () => {
    client.clearEvents()
    await client.send('chat.send', { content: 'Run exactly: cat /etc/hosts' })
    const pending = await client.waitFor('chat.path_confirmation')
    const callId = (pending.payload as { callId: string }).callId
    expect(await pendingOf()).toHaveLength(1)

    await stopSessionChat(server.url, sessionId)

    const resolved = await client.waitFor('session.confirmation_resolved', undefined, 5000)
    expect((resolved.payload as { callId: string }).callId).toBe(callId)
    // What a reload would show: nothing pending any more.
    expect(await pendingOf()).toEqual([])
  })
})
