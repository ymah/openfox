import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createInstructionsRoutes } from './instructions.js'

describe('instructions import routes', () => {
  let rootDir: string
  let server: Server
  let baseUrl: string

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'openfox-instructions-routes-'))
    const app = express()
    app.use(express.json({ limit: '10mb' }))
    app.use('/api/instructions', createInstructionsRoutes(join(rootDir, 'project')))
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${(server.address() as { port: number }).port}`
        resolve()
      })
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(rootDir, { recursive: true, force: true })
  })

  describe('POST /import-to-project', () => {
    it('bulk-imports .md files from a local directory into the project', async () => {
      const sourceDir = join(rootDir, 'external-instructions')
      await mkdir(sourceDir, { recursive: true })
      await writeFile(join(sourceDir, 'style.md'), 'Follow the style guide')
      await writeFile(join(sourceDir, 'testing.md'), 'Write tests first')

      const response = await fetch(`${baseUrl}/api/instructions/import-to-project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourcePath: sourceDir }),
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as { imported: string[]; skipped: unknown[] }
      expect(body.imported.sort()).toEqual(['style.md', 'testing.md'])
      expect(body.skipped).toEqual([])
      expect(await readFile(join(rootDir, 'project', '.openfox', 'instructions', 'style.md'), 'utf-8')).toBe(
        'Follow the style guide',
      )
    })

    it('reports non-.md files as skipped rather than importing them', async () => {
      const sourceDir = join(rootDir, 'external-instructions-mixed')
      await mkdir(sourceDir, { recursive: true })
      await writeFile(join(sourceDir, 'notes.md'), 'Notes')
      await writeFile(join(sourceDir, 'logo.png'), 'not markdown')

      const response = await fetch(`${baseUrl}/api/instructions/import-to-project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourcePath: sourceDir }),
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as { imported: string[]; skipped: Array<{ name: string }> }
      expect(body.imported).toEqual(['notes.md'])
      expect(body.skipped.map((s) => s.name)).toEqual(['logo.png'])
    })

    it('returns 400 for a source path that does not exist', async () => {
      const response = await fetch(`${baseUrl}/api/instructions/import-to-project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourcePath: join(rootDir, 'does-not-exist') }),
      })

      expect(response.status).toBe(400)
    })

    it('returns 400 when sourcePath is missing', async () => {
      const response = await fetch(`${baseUrl}/api/instructions/import-to-project`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
    })

    it('returns 400 when there is no active project', async () => {
      const app = express()
      app.use(express.json())
      app.use('/api/instructions', createInstructionsRoutes(undefined))
      const noProjectServer = await new Promise<Server>((resolve) => {
        const s = app.listen(0, () => resolve(s))
      })
      const noProjectUrl = `http://localhost:${(noProjectServer.address() as { port: number }).port}`

      try {
        const response = await fetch(`${noProjectUrl}/api/instructions/import-to-project`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sourcePath: rootDir }),
        })
        expect(response.status).toBe(400)
      } finally {
        await new Promise<void>((resolve) => noProjectServer.close(() => resolve()))
      }
    })
  })
})
