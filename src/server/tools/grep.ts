import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { OUTPUT_LIMITS } from './types.js'
import { createTool } from './tool-helpers.js'
import { listSearchableFiles, looksBinary, resolveSearchRoot } from './search-shared.js'
import { detectEncoding, decodeContent } from '../utils/encoding.js'

interface GrepArgs {
  pattern: string
  path?: string
  glob?: string
  ignoreCase?: boolean
  regex?: boolean
}

interface Match {
  file: string
  line: number
  text: string
}

/** Per-file read cap for search — deliberately tighter than read_file's 20MB
 *  general limit, since grep scans many files in one call, not one file. */
const MAX_GREP_FILE_BYTES = 2_000_000

function buildMatcher(pattern: string, ignoreCase: boolean, regex: boolean): RegExp {
  const source = regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(source, ignoreCase ? 'i' : '')
}

export const grepFilesTool = createTool<GrepArgs>(
  'grep_files',
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description:
        `Search file contents for a pattern (regex by default). ` +
        `node_modules, .git, dist, .next, build, coverage and anything in .gitignore are excluded automatically — ` +
        `do not pass exclude flags, they are not needed. Binary files are skipped. ` +
        `Results capped at ${OUTPUT_LIMITS.grep.maxMatches} matches, grouped by file.`,
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Pattern to search for. Treated as a regular expression unless regex is false.',
          },
          path: {
            type: 'string',
            description: 'Directory to search from (relative to workdir or absolute). Default: workdir.',
          },
          glob: {
            type: 'string',
            description: 'Restrict to files matching this glob (e.g. "**/*.ts"). Default: all files.',
          },
          ignoreCase: {
            type: 'boolean',
            description: 'Case-insensitive match. Default: false.',
          },
          regex: {
            type: 'boolean',
            description: 'Treat pattern as a regular expression. Default: true. Set false to search a literal string.',
          },
        },
        required: ['pattern'],
      },
    },
  },
  async (args, context, helpers) => {
    // jscpd:ignore-start
    const resolved = await resolveSearchRoot(args.path, context, helpers)
    if ('error' in resolved) return resolved.error
    const { rootDir } = resolved
    // jscpd:ignore-end

    let matcher: RegExp
    try {
      matcher = buildMatcher(args.pattern, args.ignoreCase ?? false, args.regex ?? true)
    } catch (error) {
      return helpers.error(`Invalid pattern: ${error instanceof Error ? error.message : String(error)}`)
    }

    const files = await listSearchableFiles(rootDir, args.glob ?? '**/*')

    const matches: Match[] = []
    let truncated = false

    for (const relPath of files) {
      if (matches.length >= OUTPUT_LIMITS.grep.maxMatches) {
        truncated = true
        break
      }

      const absPath = join(rootDir, relPath)
      let stats
      try {
        stats = await stat(absPath)
      } catch {
        continue
      }
      if (stats.size === 0 || stats.size > MAX_GREP_FILE_BYTES) continue

      const buffer = await readFile(absPath)
      if (looksBinary(buffer)) continue

      const { encoding } = detectEncoding(buffer)
      const content = decodeContent(buffer, encoding)
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        if (matcher.test(lines[i]!)) {
          matches.push({ file: relPath, line: i + 1, text: lines[i]! })
          if (matches.length >= OUTPUT_LIMITS.grep.maxMatches) {
            truncated = true
            break
          }
        }
      }
    }

    if (matches.length === 0) {
      return helpers.success('No matches found.')
    }

    const byFile = new Map<string, Match[]>()
    for (const match of matches) {
      const existing = byFile.get(match.file)
      if (existing) existing.push(match)
      else byFile.set(match.file, [match])
    }

    const sections = [...byFile.entries()].map(([file, fileMatches]) => {
      const lines = fileMatches.map((m) => `  ${m.line}: ${m.text.trim()}`).join('\n')
      return `${file}\n${lines}`
    })

    let output = sections.join('\n\n')
    if (truncated) {
      output += `\n\n[${OUTPUT_LIMITS.grep.maxMatches} match limit reached — narrow the pattern, path, or glob]`
    }

    return helpers.success(output, truncated)
  },
)
