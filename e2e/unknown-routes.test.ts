/**
 * Requests the server cannot serve must be answered, not left hanging:
 * unknown /api routes get a JSON 404, a malformed JSON body gets a 400.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTestServer,
  createTestProject,
  createProject,
  createSession,
  type TestServerHandle,
} from './utils/index.js'

describe('Unknown routes and malformed bodies', () => {
  let server: TestServerHandle
  const request = (path: string, init?: RequestInit) =>
    fetch(`${server.url}${path}`, { signal: AbortSignal.timeout(5000), ...init })

  beforeAll(async () => {
    server = await createTestServer()
  })
  afterAll(async () => {
    await server.close()
  })

  it('answers an unknown /api route with a JSON 404', async () => {
    const res = await request('/api/no/such/route')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toBeTruthy()
  })

  it('answers an unknown static asset with a 404', async () => {
    const res = await request('/assets/missing-chunk.js')
    expect(res.status).toBe(404)
  })

  it('answers a malformed JSON body with a 400', async () => {
    const res = await request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/json/i)
  })

  it('rejects a message whose content or attachments have the wrong type', async () => {
    const testProject = await createTestProject({ template: 'empty' })
    const project = await createProject(server.url, { name: 'types', workdir: testProject.path })
    const session = await createSession(server.url, { projectId: project.id, title: 't' })
    const post = (body: unknown) =>
      request(`/api/sessions/${session.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    expect((await post({ content: 42 })).status).toBe(400)
    expect((await post({ content: 'hi', attachments: 'x' })).status).toBe(400)
    await testProject.cleanup()
  })

  it('rejects a provider whose URL is not an http(s) URL', async () => {
    const res = await request('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', url: 'not a url', backend: 'vllm', model: 'm' }),
    })
    expect(res.status).toBe(400)
    const ftp = await request('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ftp', url: 'ftp://host/x', backend: 'vllm', model: 'm' }),
    })
    expect(ftp.status).toBe(400)
  })

  it('rejects wrongly typed fields on project and session routes with a 400', async () => {
    const send = (method: string, path: string, body: unknown) =>
      request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const testProject = await createTestProject({ template: 'empty' })
    const project = await createProject(server.url, { name: 'typed', workdir: testProject.path })
    expect((await send('POST', '/api/projects/check-permissions', { path: 123 })).status).toBe(400)
    expect((await send('PUT', `/api/projects/${project.id}`, { name: {} })).status).toBe(400)
    expect((await send('PUT', `/api/projects/${project.id}`, { dangerLevel: 'extreme' })).status).toBe(400)
    expect((await send('POST', '/api/sessions', { projectId: {} })).status).toBe(400)
    expect((await send('POST', '/api/sessions', { projectId: project.id, title: [] })).status).toBe(400)
    await testProject.cleanup()
  })

  it('rejects a dev-server config whose command or url is not a string', async () => {
    const testProject = await createTestProject({ template: 'empty' })
    const res = await request(`/api/dev-server/config?workdir=${encodeURIComponent(testProject.path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 5, url: [] }),
    })
    expect(res.status).toBe(400)
    await testProject.cleanup()
  })

  it('only stores string values under reasonable setting keys', async () => {
    const put = (key: string, value: unknown) =>
      request(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
    expect((await put('display.theme', 'dark')).status).toBe(200)
    expect((await put('display.theme', { a: 1 })).status).toBe(400)
    expect((await put('display.theme', 5)).status).toBe(400)
    expect((await put('display.theme', null)).status).toBe(400)
    expect((await put('display.theme', true)).status).toBe(400)
    expect((await put('k'.repeat(500), 'x')).status).toBe(400)
  })
})
