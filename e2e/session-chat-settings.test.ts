/**
 * Per-conversation chat settings (persona + sampling) over REST.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createTestServer, createTestProject, type TestServerHandle, type TestProject } from './utils/index.js'

describe('Session chat settings REST API', () => {
  let server: TestServerHandle
  let testProject: TestProject
  let sessionId: string

  const put = (id: string, settings: unknown) =>
    fetch(`${server.url}/api/sessions/${id}/chat-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    })
  const get = (id: string) => fetch(`${server.url}/api/sessions/${id}/chat-settings`)

  beforeAll(async () => {
    server = await createTestServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    testProject = await createTestProject({ template: 'empty' })
    const project: any = await (
      await fetch(`${server.url}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chat Settings', workdir: testProject.path }),
      })
    ).json()
    const session: any = await (
      await fetch(`${server.url}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.project.id, title: 'S' }),
      })
    ).json()
    sessionId = session.session.id
  })

  afterEach(async () => {
    await testProject.cleanup()
  })

  it('starts empty, stores settings and reads them back', async () => {
    expect(((await (await get(sessionId)).json()) as any).settings).toEqual({})

    const res = await put(sessionId, { temperature: 0.4, topP: 0.8, maxTokens: 1024, systemPrompt: 'Be brief.' })
    expect(res.status).toBe(200)
    expect(((await (await get(sessionId)).json()) as any).settings).toEqual({
      temperature: 0.4,
      topP: 0.8,
      maxTokens: 1024,
      systemPrompt: 'Be brief.',
    })
  })

  it('an empty object resets', async () => {
    await put(sessionId, { temperature: 0.4 })
    await put(sessionId, {})
    expect(((await (await get(sessionId)).json()) as any).settings).toEqual({})
  })

  it('rejects out-of-range values with 400 and keeps the previous settings', async () => {
    await put(sessionId, { temperature: 0.4 })
    const res = await put(sessionId, { temperature: 9 })
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error).toMatch(/temperature/)
    expect(((await (await get(sessionId)).json()) as any).settings).toEqual({ temperature: 0.4 })
  })

  it('returns 404 for an unknown session', async () => {
    expect((await get('nope')).status).toBe(404)
    expect((await put('nope', {})).status).toBe(404)
  })
})
