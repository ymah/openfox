/**
 * Full-text search over conversations, through the real server: messages are
 * indexed as turns happen, hidden versions are not listed, deleting a
 * conversation removes its hits.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  createTestServer,
  createTestProject,
  createProject,
  createSession,
  type TestServerHandle,
  type TestProject,
} from './utils/index.js'
import { sendMessage } from './utils/rest-client.js'

describe('Message search REST API', () => {
  let server: TestServerHandle
  let testProject: TestProject
  let projectId: string

  const api = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init)
  const search = async (q: string, extra = ''): Promise<any[]> =>
    ((await (await api(`/api/search/messages?q=${encodeURIComponent(q)}${extra}`)).json()) as any).hits

  async function untilReplied(sessionId: string): Promise<void> {
    const deadline = Date.now() + 15_000
    for (;;) {
      const data: any = await (await api(`/api/sessions/${sessionId}`)).json()
      const replied = (data.messages as { role: string }[]).some((m) => m.role === 'assistant')
      if (replied && !data.session.isRunning) return
      if (Date.now() > deadline) throw new Error('timed out waiting for a reply')
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  beforeAll(async () => {
    server = await createTestServer()
  })
  afterAll(async () => {
    await server.close()
  })
  beforeEach(async () => {
    testProject = await createTestProject({ template: 'empty' })
    projectId = (await createProject(server.url, { name: 'Search', workdir: testProject.path })).id
  })
  afterEach(async () => {
    await testProject.cleanup()
  })

  it('finds a message sent through the API, with a marked snippet', async () => {
    const session = await createSession(server.url, { projectId, title: 'Gardening' })
    await sendMessage(server.url, session.id, 'How do I grow aubergines on a balcony?')
    await untilReplied(session.id)

    const hits = await search('aubergines')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ sessionId: session.id, role: 'user', title: 'Gardening', projectId })
    expect(hits[0].snippet).toContain('\u0001aubergines\u0002')
  })

  it('scopes by project and ignores accents', async () => {
    const session = await createSession(server.url, { projectId, title: 'Cuisine' })
    await sendMessage(server.url, session.id, 'Une recette de crème brûlée, s’il vous plaît')
    await untilReplied(session.id)
    expect(await search('creme brulee')).toHaveLength(1)
    expect(await search('creme brulee', `&projectId=${projectId}`)).toHaveLength(1)
    expect(await search('creme brulee', '&projectId=nope')).toHaveLength(0)
  })

  it('does not list a regenerated version separately', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Explain the marmalade paradox')
    await untilReplied(session.id)
    const data: any = await (await api(`/api/sessions/${session.id}`)).json()
    const reply = [...data.messages].reverse().find((m: { role: string }) => m.role === 'assistant')
    const res = await api(`/api/sessions/${session.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: reply.id }),
    })
    const version = ((await res.json()) as any).session.id as string
    await untilReplied(version)

    expect((await search('marmalade')).map((h) => h.sessionId)).toEqual([session.id])
  })

  it('a deleted conversation no longer matches', async () => {
    const session = await createSession(server.url, { projectId, title: 'Temp' })
    await sendMessage(server.url, session.id, 'Remember the gooseberry')
    await untilReplied(session.id)
    expect(await search('gooseberry')).toHaveLength(1)
    await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
    expect(await search('gooseberry')).toHaveLength(0)
  })

  it('returns nothing for an empty or one-letter query', async () => {
    expect(await search('')).toEqual([])
    expect(await search('a')).toEqual([])
  })
})
