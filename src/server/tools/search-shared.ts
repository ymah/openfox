/**
 * Shared file-discovery for grep_files and glob_files.
 *
 * These directory exclusions used to live only in prose, in the explorer
 * agent's system prompt ("ALWAYS exclude --exclude-dir=node_modules ...") —
 * asking the model to remember six flags on every call. Here they are a
 * property of the tool: the harness enforces them, the model cannot forget
 * or omit them.
 */

import fg from 'fast-glob'
import ignore from 'ignore'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolResult } from '../../shared/types.js'
import type { ToolContext } from './types.js'
import type { ToolHelpers } from './tool-helpers.js'

/** Directories never searched by default, regardless of .gitignore content. */
export const DEFAULT_EXCLUDE_DIRS = ['node_modules', '.git', 'dist', '.next', 'build', 'coverage']

const DEFAULT_FAST_GLOB_IGNORE = DEFAULT_EXCLUDE_DIRS.map((dir) => `**/${dir}/**`)

/**
 * Build a predicate for paths (relative to rootDir, forward-slash separated)
 * that should be skipped: the hard-coded defaults above, plus whatever the
 * project's own .gitignore excludes. Missing/unreadable .gitignore is not an
 * error — search just falls back to the defaults alone.
 */
export async function loadIgnoreFilter(rootDir: string): Promise<(relPath: string) => boolean> {
  const ig = ignore()
  ig.add(DEFAULT_EXCLUDE_DIRS)
  try {
    const gitignoreContent = await readFile(join(rootDir, '.gitignore'), 'utf-8')
    ig.add(gitignoreContent)
  } catch {
    // No .gitignore, or unreadable — defaults still apply.
  }
  return (relPath: string) => ig.ignores(relPath)
}

/**
 * Enumerate files under rootDir matching `pattern`, already filtered through
 * the default excludes and the project's .gitignore. Symlinks are not
 * followed, so a symlinked node_modules or vendored copy can't reintroduce
 * what was just excluded.
 */
export async function listSearchableFiles(rootDir: string, pattern: string): Promise<string[]> {
  const candidates = await fg([pattern], {
    cwd: rootDir,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: DEFAULT_FAST_GLOB_IGNORE,
  })
  const isIgnored = await loadIgnoreFilter(rootDir)
  return candidates.filter((relPath) => !isIgnored(relPath)).sort()
}

/**
 * Resolve and validate the directory a search tool (grep_files, glob_files)
 * should run from: applies the sandbox path check, then confirms it exists
 * and is a directory. Shared so both tools fail the same way on the same
 * inputs instead of drifting.
 */
export async function resolveSearchRoot(
  path: string | undefined,
  context: Pick<ToolContext, 'workdir'>,
  helpers: Pick<ToolHelpers, 'resolvePath' | 'checkPathAccess' | 'error'>,
): Promise<{ rootDir: string } | { error: ToolResult }> {
  const rootDir = path ? helpers.resolvePath(path) : context.workdir
  await helpers.checkPathAccess([rootDir])

  try {
    const rootStat = await stat(rootDir)
    if (!rootStat.isDirectory()) {
      return { error: helpers.error(`Not a directory: ${path ?? '.'}`) }
    }
  } catch {
    return { error: helpers.error(`Directory not found: ${path ?? '.'}`) }
  }

  return { rootDir }
}

/**
 * Cheap binary-content heuristic (a NUL byte in the first 8KB) — matches the
 * convention grep/ripgrep themselves use to skip binary files.
 */
export function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 8000)
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0) return true
  }
  return false
}
