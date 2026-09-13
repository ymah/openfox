import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let workdir = ''

vi.mock('../db/projects.js', () => ({
  getProject: (id: string) => (id === 'proj-1' ? { id: 'proj-1', workdir, name: 'Book' } : null),
}))

const { registerWritingRoutes } = await import('./writing.js')

describe('writing routes', () => {
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), 'openfox-writing-'))
    const app = express()
    app.use(express.json())
    const router = express.Router()
    registerWritingRoutes(router)
    app.use('/api', router)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${(server.address() as { port: number }).port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(workdir, { recursive: true, force: true })
  })

  it('returns 404 for an unknown project', async () => {
    const res = await fetch(`${baseUrl}/api/projects/missing/codex`)
    expect(res.status).toBe(404)
  })

  it('lists an empty codex before any entry exists', async () => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/codex`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entries: [] })
  })

  it('creates and reads back a codex entry', async () => {
    const put = await fetch(`${baseUrl}/api/projects/proj-1/codex/characters/lena`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Lena', tags: ['protagonist'], facts: { age: '34' }, body: 'A pilot.' }),
    })
    expect(put.status).toBe(200)

    const list = await fetch(`${baseUrl}/api/projects/proj-1/codex`)
    const { entries } = (await list.json()) as { entries: unknown[] }
    expect(entries).toEqual([
      {
        type: 'characters',
        slug: 'lena',
        title: 'Lena',
        tags: ['protagonist'],
        facts: { age: '34' },
        body: 'A pilot.',
      },
    ])

    const one = await fetch(`${baseUrl}/api/projects/proj-1/codex/characters/lena`)
    expect(await one.json()).toEqual({
      type: 'characters',
      slug: 'lena',
      title: 'Lena',
      tags: ['protagonist'],
      facts: { age: '34' },
      body: 'A pilot.',
    })
  })

  it('rejects an unknown codex type', async () => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/codex/not-a-type/lena`)
    expect(res.status).toBe(400)
  })

  it('rejects a path-traversal codex slug that escapes the vault', async () => {
    const escapeAttempt = '../'.repeat(20) + 'etc/passwd'
    const res = await fetch(`${baseUrl}/api/projects/proj-1/codex/characters/${encodeURIComponent(escapeAttempt)}`)
    expect(res.status).toBe(400)
  })

  it('lists a manuscript tree from acts/chapters/scenes on disk', async () => {
    const sceneDir = join(workdir, 'manuscript', '01-act-one', '01-chapter-one')
    await mkdir(sceneDir, { recursive: true })
    await writeFile(
      join(sceneDir, '01-scene.md'),
      '---\ntitle: Opening\npov: Lena\nstatus: draft\nsummary: She wakes up.\n---\n\nBody text.',
    )

    const res = await fetch(`${baseUrl}/api/projects/proj-1/manuscript`)
    expect(await res.json()).toEqual({
      acts: [
        {
          slug: '01-act-one',
          title: 'act one',
          chapters: [
            {
              slug: '01-chapter-one',
              title: 'chapter one',
              scenes: [
                {
                  slug: '01-scene',
                  path: 'manuscript/01-act-one/01-chapter-one/01-scene.md',
                  title: 'Opening',
                  pov: 'Lena',
                  status: 'draft',
                  summary: 'She wakes up.',
                },
              ],
            },
          ],
        },
      ],
    })
  })

  it('returns an empty manuscript when the folder does not exist yet', async () => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/manuscript`)
    expect(await res.json()).toEqual({ acts: [] })
  })

  it('creates and reads back a scene, preserving frontmatter across a partial update', async () => {
    const path = 'manuscript/01-act-one/01-chapter-one/01-scene.md'
    const put = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frontmatter: { status: 'draft', summary: 'She wakes up.' }, body: 'Once upon a time.' }),
    })
    expect(put.status).toBe(200)

    const update = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frontmatter: { status: 'revised' }, body: 'Once upon a time, revised.' }),
    })
    const updated = (await update.json()) as { frontmatter: Record<string, unknown> }
    expect(updated.frontmatter).toEqual({ id: '01-scene', status: 'revised', summary: 'She wakes up.' })

    const get = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent(path)}`)
    const scene = (await get.json()) as { frontmatter: Record<string, unknown>; body: string }
    expect(scene.frontmatter).toEqual({ id: '01-scene', status: 'revised', summary: 'She wakes up.' })
    expect(scene.body.trim()).toBe('Once upon a time, revised.')
  })

  it('rejects a scene path that escapes the vault', async () => {
    const res = await fetch(
      `${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent('../outside.md')}`,
    )
    expect(res.status).toBe(400)
  })

  it('rejects scene paths outside manuscript/ even when they stay inside the vault', async () => {
    for (const bad of ['.git/config', 'AGENTS.md', 'codex/characters/x.md', 'manuscript/notes.txt', '.env']) {
      const res = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent(bad)}`)
      expect(res.status, bad).toBe(400)
      const put = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene?path=${encodeURIComponent(bad)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'overwritten' }),
      })
      expect(put.status, bad).toBe(400)
    }
  })

  it('rejects a codex slug containing a path separator (%2F is decoded by Express)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/codex/characters/${encodeURIComponent('a/b')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(res.status).toBe(400)
    const dotted = await fetch(`${baseUrl}/api/projects/proj-1/codex/characters/Bad.Slug`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    })
    expect(dotted.status).toBe(400)
  })

  it('requires a path query parameter for scene reads', async () => {
    const res = await fetch(`${baseUrl}/api/projects/proj-1/manuscript/scene`)
    expect(res.status).toBe(400)
  })
})
