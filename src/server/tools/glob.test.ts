import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { globFilesTool } from './glob.js'
import type { ToolContext } from './types.js'
import { OUTPUT_LIMITS } from './types.js'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('glob_files', () => {
  let tempDir: string
  let context: ToolContext

  const mockSessionManager = {
    recordFileRead: vi.fn(),
    getReadFiles: vi.fn().mockReturnValue({}),
    updateFileHash: vi.fn(),
  } as any

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'glob-test-'))
    context = {
      sessionManager: mockSessionManager,
      workdir: tempDir,
      sessionId: 'test-session',
    }

    await mkdir(join(tempDir, 'src', 'nested'), { recursive: true })
    await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(join(tempDir, '.git'), { recursive: true })
    await mkdir(join(tempDir, 'dist'), { recursive: true })

    await writeFile(join(tempDir, 'src', 'a.ts'), 'export const a = 1\n')
    await writeFile(join(tempDir, 'src', 'b.ts'), 'export const b = 2\n')
    await writeFile(join(tempDir, 'src', 'nested', 'c.ts'), 'export const c = 3\n')
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'index.js'), '// vendored\n')
    await writeFile(join(tempDir, '.git', 'config'), '[core]\n')
    await writeFile(join(tempDir, 'dist', 'bundle.js'), '// built\n')
    await writeFile(join(tempDir, 'ignored-by-gitignore.txt'), 'secret\n')
    await writeFile(join(tempDir, '.gitignore'), 'ignored-by-gitignore.txt\n')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('finds files matching a recursive pattern', async () => {
    const result = await globFilesTool.execute({ pattern: '**/*.ts' }, context)

    expect(result.success).toBe(true)
    expect(result.output).toContain('src/a.ts')
    expect(result.output).toContain('src/b.ts')
    expect(result.output).toContain('src/nested/c.ts')
  })

  it('excludes node_modules, .git and dist by default', async () => {
    const result = await globFilesTool.execute({ pattern: '**/*' }, context)

    expect(result.output).not.toContain('node_modules')
    expect(result.output).not.toContain('.git/config')
    expect(result.output).not.toContain('dist/bundle.js')
  })

  it('excludes files matched by .gitignore', async () => {
    const result = await globFilesTool.execute({ pattern: '*.txt' }, context)

    expect(result.output).not.toContain('ignored-by-gitignore.txt')
    expect(result.output).toBe('No files matched.')
  })

  it('restricts the search to the given path', async () => {
    const result = await globFilesTool.execute({ pattern: '*.ts', path: 'src' }, context)

    expect(result.output).toContain('a.ts')
    expect(result.output).toContain('b.ts')
    expect(result.output).not.toContain('nested/c.ts')
  })

  it('reports no matches without erroring', async () => {
    const result = await globFilesTool.execute({ pattern: '**/*.rs' }, context)

    expect(result.success).toBe(true)
    expect(result.output).toBe('No files matched.')
  })

  it('errors on a missing directory', async () => {
    const result = await globFilesTool.execute({ pattern: '*', path: 'does-not-exist' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('caps results and reports truncation', async () => {
    const manyDir = join(tempDir, 'many')
    await mkdir(manyDir, { recursive: true })
    const count = OUTPUT_LIMITS.glob.maxResults + 25
    await Promise.all(
      Array.from({ length: count }, (_, i) => writeFile(join(manyDir, `file-${String(i).padStart(4, '0')}.txt`), '')),
    )

    const result = await globFilesTool.execute({ pattern: 'many/*.txt' }, context)

    expect(result.truncated).toBe(true)
    expect(result.output).toContain('more matches omitted')
    const lineCount = result.output!.split('\n').filter((l) => l.startsWith('many/')).length
    expect(lineCount).toBe(OUTPUT_LIMITS.glob.maxResults)
  })
})
