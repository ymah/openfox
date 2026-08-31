import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { grepFilesTool } from './grep.js'
import type { ToolContext } from './types.js'
import { OUTPUT_LIMITS } from './types.js'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('grep_files', () => {
  let tempDir: string
  let context: ToolContext

  const mockSessionManager = {
    recordFileRead: vi.fn(),
    getReadFiles: vi.fn().mockReturnValue({}),
    updateFileHash: vi.fn(),
  } as any

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'grep-test-'))
    context = {
      sessionManager: mockSessionManager,
      workdir: tempDir,
      sessionId: 'test-session',
    }

    await mkdir(join(tempDir, 'src'), { recursive: true })
    await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(join(tempDir, 'vendor'), { recursive: true })

    await writeFile(join(tempDir, 'src', 'foo.js'), 'function foo() {\n  return 1\n}\nfoo()\n')
    await writeFile(join(tempDir, 'src', 'bar.js'), 'function bar() {\n  return 2\n}\n')
    await writeFile(join(tempDir, 'src', 'FooCased.js'), 'const FOOTER = true\n')
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'foo.js'), 'function foo() { /* vendored */ }\n')
    await writeFile(join(tempDir, 'vendor', 'foo.js'), 'function foo() { /* also ignored */ }\n')
    await writeFile(join(tempDir, '.gitignore'), 'vendor/\n')
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('finds matches grouped by file with line numbers', async () => {
    const result = await grepFilesTool.execute({ pattern: 'function' }, context)

    expect(result.success).toBe(true)
    expect(result.output).toContain('src/foo.js')
    expect(result.output).toContain('1: function foo()')
    expect(result.output).toContain('src/bar.js')
  })

  it('excludes node_modules by default', async () => {
    const result = await grepFilesTool.execute({ pattern: 'foo' }, context)

    expect(result.output).not.toContain('node_modules')
  })

  it('excludes paths matched by .gitignore', async () => {
    const result = await grepFilesTool.execute({ pattern: 'foo' }, context)

    expect(result.output).not.toContain('vendor/foo.js')
  })

  it('is case-sensitive by default', async () => {
    const result = await grepFilesTool.execute({ pattern: 'FOOTER' }, context)

    expect(result.output).toContain('FooCased.js')
    expect(result.output).not.toContain('src/foo.js')
  })

  it('matches case-insensitively when ignoreCase is set', async () => {
    const result = await grepFilesTool.execute({ pattern: 'FUNCTION', ignoreCase: true }, context)

    expect(result.output).toContain('src/foo.js')
    expect(result.output).toContain('src/bar.js')
  })

  it('treats the pattern as a literal string when regex is false', async () => {
    await writeFile(join(tempDir, 'src', 'dots.js'), 'a.b.c\naxbxc\n')

    const literal = await grepFilesTool.execute({ pattern: 'a.b.c', path: 'src', regex: false }, context)
    expect(literal.output).toContain('1: a.b.c')
    expect(literal.output).not.toContain('axbxc')
  })

  it('restricts to files matching the glob filter', async () => {
    await writeFile(join(tempDir, 'src', 'note.md'), 'function-like text but not code\n')

    const result = await grepFilesTool.execute({ pattern: 'function', glob: '**/*.js' }, context)

    expect(result.output).not.toContain('note.md')
  })

  it('restricts the search to the given path', async () => {
    const result = await grepFilesTool.execute({ pattern: 'foo', path: 'src' }, context)

    expect(result.output).toContain('foo.js')
    expect(result.output).not.toContain('vendor')
  })

  it('skips binary files without erroring', async () => {
    await writeFile(join(tempDir, 'src', 'binary.dat'), Buffer.from([0x00, 0x01, 0x02, 0x66, 0x6f, 0x6f]))

    const result = await grepFilesTool.execute({ pattern: 'foo' }, context)

    expect(result.success).toBe(true)
    expect(result.output).not.toContain('binary.dat')
  })

  it('reports no matches without erroring', async () => {
    const result = await grepFilesTool.execute({ pattern: 'nothing-matches-this-xyz' }, context)

    expect(result.success).toBe(true)
    expect(result.output).toBe('No matches found.')
  })

  it('errors on an invalid regex', async () => {
    const result = await grepFilesTool.execute({ pattern: '(unclosed' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid pattern')
  })

  it('errors on a missing directory', async () => {
    const result = await grepFilesTool.execute({ pattern: 'foo', path: 'does-not-exist' }, context)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('caps matches and reports truncation', async () => {
    const lines = Array.from({ length: OUTPUT_LIMITS.grep.maxMatches + 50 }, (_, i) => `match-${i}`).join('\n')
    await writeFile(join(tempDir, 'src', 'many-matches.txt'), lines)

    const result = await grepFilesTool.execute({ pattern: 'match-' }, context)

    expect(result.truncated).toBe(true)
    expect(result.output).toContain('match limit reached')
  })
})
