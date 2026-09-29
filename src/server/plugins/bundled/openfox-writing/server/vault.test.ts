import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error -- plain JS module, shipped verbatim in the plugin
import { registerVaultRpc } from './vault.js'

/**
 * The vault RPC methods, which replaced the core's writing REST routes. The path
 * guards here are the only thing keeping a scene path inside the project's vault,
 * so they are the point of these tests.
 */
type Handler = (params: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>

let workdir: string
let handlers: Map<string, Handler>

function context(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { sessionId: 's1', projectId: 'p1', workdir, ...overrides }
}

function call(method: string, params: Record<string, unknown> = {}, ctx = context()): Promise<unknown> {
  const handler = handlers.get(method)
  if (!handler) throw new Error(`no handler for ${method}`)
  return handler(params, ctx)
}

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), 'openfox-vault-'))
  handlers = new Map()
  registerVaultRpc({ registerRpc: (method: string, handler: Handler) => handlers.set(method, handler) })
})

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true })
})

describe('vault path guards', () => {
  it('refuses a scene path outside manuscript/', async () => {
    await expect(call('scene.get', { path: '.git/config' })).rejects.toThrow(/Invalid scene path/)
    await expect(call('scene.get', { path: 'AGENTS.md' })).rejects.toThrow(/Invalid scene path/)
    await expect(call('scene.get', { path: 'codex/characters/lena.md' })).rejects.toThrow(/Invalid scene path/)
  })

  it('refuses traversal inside an otherwise valid scene path', async () => {
    await expect(call('scene.get', { path: 'manuscript/../../etc/passwd.md' })).rejects.toThrow(/Invalid scene path/)
    await expect(call('scene.save', { path: 'manuscript/a/../../../x.md', body: 'x' })).rejects.toThrow(
      /Invalid scene path/,
    )
  })

  it('refuses a non-markdown scene path', async () => {
    await expect(call('scene.get', { path: 'manuscript/act/ch/scene.txt' })).rejects.toThrow(/Invalid scene path/)
  })

  it('refuses a codex slug that would escape its directory', async () => {
    await expect(call('codex.get', { type: 'characters', slug: 'a/b' })).rejects.toThrow(/Invalid slug/)
    await expect(call('codex.get', { type: 'characters', slug: '../secret' })).rejects.toThrow(/Invalid slug/)
    await expect(call('codex.get', { type: 'characters', slug: 'Lena' })).rejects.toThrow(/Invalid slug/)
  })

  it('refuses an unknown codex type', async () => {
    await expect(call('codex.get', { type: 'weapons', slug: 'sword' })).rejects.toThrow(/Unknown codex type/)
  })

  it('requires a project, since the workdir is resolved from it server-side', async () => {
    await expect(call('manuscript.tree', {}, { sessionId: 's1', workdir })).rejects.toThrow(/projectId is required/)
  })
})

describe('vault round-trips', () => {
  it('writes and reads a scene, seeding the id from the file name', async () => {
    const path = 'manuscript/01-act-one/01-chapter-one/01-scene.md'
    await call('scene.save', { path, frontmatter: { status: 'draft' }, body: 'Once upon a time.' })

    const raw = await readFile(join(workdir, path), 'utf-8')
    expect(raw).toContain('id: 01-scene')

    const scene = (await call('scene.get', { path })) as { frontmatter: Record<string, unknown>; body: string }
    expect(scene.frontmatter['status']).toBe('draft')
    // gray-matter's stringify ends the document with a newline; only the leading
    // one is stripped on read, exactly as the REST route behaved.
    expect(scene.body.trim()).toBe('Once upon a time.')
  })

  it('preserves existing frontmatter a partial save does not mention', async () => {
    const path = 'manuscript/01-act/01-ch/01-scene.md'
    await call('scene.save', { path, frontmatter: { status: 'draft', pov: 'Lena' }, body: 'a' })
    await call('scene.save', { path, frontmatter: { status: 'revised' }, body: 'b' })

    const scene = (await call('scene.get', { path })) as { frontmatter: Record<string, unknown> }
    expect(scene.frontmatter['status']).toBe('revised')
    expect(scene.frontmatter['pov']).toBe('Lena')
  })

  it('lists the manuscript tree it just wrote', async () => {
    await call('scene.save', { path: 'manuscript/01-act-one/01-chapter-one/01-scene.md', body: '' })

    const tree = (await call('manuscript.tree')) as { acts: { title: string; chapters: { scenes: unknown[] }[] }[] }
    expect(tree.acts).toHaveLength(1)
    expect(tree.acts[0]?.title).toBe('act one')
    expect(tree.acts[0]?.chapters[0]?.scenes).toHaveLength(1)
  })

  it('returns an empty manuscript when the vault has none yet', async () => {
    expect(await call('manuscript.tree')).toEqual({ acts: [] })
  })

  it('writes and lists a codex entry with the singular frontmatter type', async () => {
    await call('codex.save', {
      type: 'characters',
      slug: 'lena',
      title: 'Lena',
      tags: ['pilot'],
      facts: { age: '34' },
      body: 'A pilot.',
    })

    const raw = await readFile(join(workdir, 'codex/characters/lena.md'), 'utf-8')
    expect(raw).toContain('type: character')

    const { entries } = (await call('codex.list')) as { entries: { slug: string; title: string }[] }
    expect(entries.map((e) => e.slug)).toEqual(['lena'])
    expect(entries[0]?.title).toBe('Lena')
  })

  it('reports a missing scene and a missing codex entry as not found', async () => {
    await expect(call('scene.get', { path: 'manuscript/a/b/c.md' })).rejects.toThrow(/Scene not found/)
    await expect(call('codex.get', { type: 'characters', slug: 'nobody' })).rejects.toThrow(/Entry not found/)
  })

  it('skips an unreadable codex file rather than failing the whole list', async () => {
    await mkdir(join(workdir, 'codex/characters'), { recursive: true })
    await writeFile(join(workdir, 'codex/characters/lena.md'), '---\ntitle: Lena\n---\nA pilot.', 'utf-8')
    await mkdir(join(workdir, 'codex/characters/not-a-file.md'), { recursive: true })

    const { entries } = (await call('codex.list')) as { entries: { slug: string }[] }
    expect(entries.map((e) => e.slug)).toEqual(['lena'])
  })
})
