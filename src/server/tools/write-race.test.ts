import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileTool } from './write.js'
import { withFileLock } from './edit.js'
import type { ToolContext } from './types.js'
import type { SessionManager } from '../session/manager.js'

function hashFile(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

describe('write_file shares edit_file per-file mutex', () => {
  let tmpDir: string
  let filePath: string
  let fileHashes: Record<string, { hash: string; readAt: string }>

  function createContext(): ToolContext {
    return {
      workdir: tmpDir,
      sessionId: 'test-session',
      sessionManager: {
        getReadFiles: () => fileHashes,
        updateFileHash: (_sessionId: string, path: string) => {
          fileHashes[path] = { hash: hashFile(path), readAt: new Date().toISOString() }
        },
        requireSession: () => ({ id: 'test-session', workdir: tmpDir }),
      } as unknown as SessionManager,
    }
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'write-race-test-'))
    filePath = join(tmpDir, 'test.txt')
    writeFileSync(filePath, 'original content\n', 'utf-8')
    fileHashes = {
      [filePath]: { hash: hashFile(filePath), readAt: new Date().toISOString() },
    }
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('waits for an in-flight lock on the same path before writing (was: bypassed the mutex entirely)', async () => {
    let releaseLock: () => void = () => {}
    const lockHeld = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    // Simulate an in-flight edit_file (or another write_file) holding the lock.
    const lockPromise = withFileLock(filePath, () => lockHeld)

    const context = createContext()
    const writePromise = writeFileTool.execute({ path: 'test.txt', content: 'new content\n' }, context)

    // While the lock is held, write_file must not have touched the file yet.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readFileSync(filePath, 'utf-8')).toBe('original content\n')

    releaseLock()
    await lockPromise
    const result = await writePromise

    expect(result.success).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('new content\n')
  })

  it('serializes two concurrent write_file calls on the same path instead of a torn/lost write', async () => {
    const context = createContext()

    const [resultA, resultB] = await Promise.all([
      writeFileTool.execute({ path: 'test.txt', content: 'content A\n' }, context),
      writeFileTool.execute({ path: 'test.txt', content: 'content B\n' }, context),
    ])

    // One must succeed outright; the other either succeeds (ran second, saw
    // the first's fresh hash) or fails cleanly on stale-hash validation —
    // never a silently corrupted/interleaved file.
    expect([resultA.success, resultB.success]).toContain(true)
    const finalContent = readFileSync(filePath, 'utf-8')
    expect(['content A\n', 'content B\n']).toContain(finalContent)
  })
})
