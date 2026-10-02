/**
 * Non-destructive regenerate / edit-and-resend: a branch is a forked session,
 * hidden from the lists, reachable with "< 2/3 >" from its original.
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

interface Msg {
  id: string
  role: string
  content: string
  isSystemGenerated?: boolean
}

describe('Session branches REST API', () => {
  let server: TestServerHandle
  let testProject: TestProject
  let projectId: string

  const api = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init)
  const post = (path: string, body: unknown) =>
    api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  async function messagesOf(sessionId: string): Promise<{ messages: Msg[]; isRunning: boolean }> {
    const data: any = await (await api(`/api/sessions/${sessionId}`)).json()
    return { messages: data.messages as Msg[], isRunning: Boolean(data.session?.isRunning) }
  }

  /** Wait until the session has finished a turn: an assistant reply and not running. */
  async function untilReplied(sessionId: string, assistantCount = 1): Promise<Msg[]> {
    const deadline = Date.now() + 15_000
    for (;;) {
      const { messages, isRunning } = await messagesOf(sessionId)
      if (!isRunning && messages.filter((m) => m.role === 'assistant').length >= assistantCount) return messages
      if (Date.now() > deadline) throw new Error(`timed out waiting for a reply in ${sessionId}`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const lastAssistant = (messages: Msg[]) => [...messages].reverse().find((m) => m.role === 'assistant')!
  const firstUser = (messages: Msg[]) => messages.find((m) => m.role === 'user' && !m.isSystemGenerated)!

  beforeAll(async () => {
    server = await createTestServer()
  })
  afterAll(async () => {
    await server.close()
  })
  beforeEach(async () => {
    testProject = await createTestProject({ template: 'empty' })
    projectId = (await createProject(server.url, { name: 'Branches', workdir: testProject.path })).id
  })
  afterEach(async () => {
    await testProject.cleanup()
  })

  it('regenerating a reply creates a hidden branch, listed as a variant of both sessions', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Hello there')
    const original = await untilReplied(session.id)

    const res = await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
    expect(res.status).toBe(201)
    const branchId = ((await res.json()) as any).session.id as string
    expect(branchId).not.toBe(session.id)
    const branch = await untilReplied(branchId)
    expect(firstUser(branch).content).toBe('Hello there')

    // The original keeps its reply, untouched.
    expect(lastAssistant((await messagesOf(session.id)).messages).id).toBe(lastAssistant(original).id)

    // Hidden from the lists, still reachable by id.
    const listed: any = await (await api(`/api/sessions?projectId=${projectId}`)).json()
    expect(listed.sessions.map((s: { id: string }) => s.id)).toEqual([session.id])
    expect((await api(`/api/sessions/${branchId}`)).status).toBe(200)

    // Both sides see the same two variants, original first.
    const fromOriginal: any = await (await api(`/api/sessions/${session.id}/versions`)).json()
    const fromBranch: any = await (await api(`/api/sessions/${branchId}/versions`)).json()
    expect(fromOriginal.variants).toEqual({ __start__: [session.id, branchId] })
    expect(fromBranch.variants).toEqual({ __start__: [session.id, branchId] })
  })

  it('branches from a later reply, keyed by the last shared message', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'First')
    const afterFirst = await untilReplied(session.id, 1)
    await sendMessage(server.url, session.id, 'Second')
    const afterSecond = await untilReplied(session.id, 2)

    const res = await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(afterSecond).id })
    const branchId = ((await res.json()) as any).session.id as string
    const branch = await untilReplied(branchId, 2)

    // The shared history is copied with the same ids…
    expect(branch.some((m) => m.id === lastAssistant(afterFirst).id)).toBe(true)
    // …and the divergence point is the reply that preceded the regenerated question.
    const variants: any = await (await api(`/api/sessions/${session.id}/versions`)).json()
    expect(Object.keys(variants.variants)).toEqual([lastAssistant(afterFirst).id])
    expect(variants.variants[lastAssistant(afterFirst).id]).toEqual([session.id, branchId])
  })

  it('editing a user message branches with the new text and leaves the original alone', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Original question')
    const original = await untilReplied(session.id)

    const res = await post(`/api/sessions/${session.id}/versions`, {
      messageId: firstUser(original).id,
      content: 'Edited question',
    })
    expect(res.status).toBe(201)
    const branchId = ((await res.json()) as any).session.id as string
    const branch = await untilReplied(branchId)

    expect(firstUser(branch).content).toBe('Edited question')
    expect(firstUser((await messagesOf(session.id)).messages).content).toBe('Original question')
  })

  it('a second regenerate adds a third variant in order', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Hi')
    const original = await untilReplied(session.id)
    const a = (
      (await (
        await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
      ).json()) as any
    ).session.id as string
    await untilReplied(a)
    const b = (
      (await (
        await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
      ).json()) as any
    ).session.id as string
    await untilReplied(b)

    const variants: any = await (await api(`/api/sessions/${b}/versions`)).json()
    expect(variants.variants.__start__).toEqual([session.id, a, b])
  })

  it('regenerating from a version makes a sibling, so every version of the reply is in one family', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Hi')
    const original = await untilReplied(session.id)
    const a = (
      (await (
        await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
      ).json()) as any
    ).session.id as string
    const fromA = await untilReplied(a)
    // regenerate while looking at version a, not the original
    const b = (
      (await (await post(`/api/sessions/${a}/versions`, { messageId: lastAssistant(fromA).id })).json()) as any
    ).session.id as string
    await untilReplied(b)

    for (const member of [session.id, a, b]) {
      const variants: any = await (await api(`/api/sessions/${member}/versions`)).json()
      expect(variants.variants.__start__).toEqual([session.id, a, b])
    }
  })

  it('carries the conversation’s persona and sampling to the branch', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await api(`/api/sessions/${session.id}/chat-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { temperature: 0.3, systemPrompt: 'Be brief.' } }),
    })
    await sendMessage(server.url, session.id, 'Hi')
    const original = await untilReplied(session.id)
    const branchId = (
      (await (
        await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
      ).json()) as any
    ).session.id as string

    const settings: any = await (await api(`/api/sessions/${branchId}/chat-settings`)).json()
    expect(settings.settings).toEqual({ temperature: 0.3, systemPrompt: 'Be brief.' })
  })

  it('validates its input', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Hi')
    const original = await untilReplied(session.id)

    expect((await post(`/api/sessions/${session.id}/versions`, {})).status).toBe(400)
    expect((await post(`/api/sessions/${session.id}/versions`, { messageId: 'nope' })).status).toBe(404)
    expect((await post(`/api/sessions/nope/versions`, { messageId: 'x' })).status).toBe(404)
    expect(
      (await post(`/api/sessions/${session.id}/versions`, { messageId: firstUser(original).id, content: '  ' })).status,
    ).toBe(400)
    expect((await api(`/api/sessions/nope/versions`)).status).toBe(404)
  })

  it('deleting the original removes its branches’ links but not the sessions', async () => {
    const session = await createSession(server.url, { projectId, title: 'Chat' })
    await sendMessage(server.url, session.id, 'Hi')
    const original = await untilReplied(session.id)
    const branchId = (
      (await (
        await post(`/api/sessions/${session.id}/versions`, { messageId: lastAssistant(original).id })
      ).json()) as any
    ).session.id as string
    await untilReplied(branchId)

    expect((await api(`/api/sessions/${session.id}`, { method: 'DELETE' })).status).toBe(200)
    const remaining: any = await (await api(`/api/sessions/${branchId}/versions`)).json()
    expect(remaining.variants).toEqual({})
  })
})
