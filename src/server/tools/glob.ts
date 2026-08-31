import { OUTPUT_LIMITS } from './types.js'
import { createTool } from './tool-helpers.js'
import { listSearchableFiles, resolveSearchRoot } from './search-shared.js'

interface GlobArgs {
  pattern: string
  path?: string
}

export const globFilesTool = createTool<GlobArgs>(
  'glob_files',
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description:
        `Find files by name pattern (e.g. "**/*.ts", "src/**/*.test.js"). ` +
        `node_modules, .git, dist, .next, build, coverage and anything in .gitignore are excluded automatically — ` +
        `do not pass exclude flags, they are not needed. Results capped at ${OUTPUT_LIMITS.glob.maxResults}, sorted by path.`,
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern, relative to path (or workdir). Use ** for recursive matching.',
          },
          path: {
            type: 'string',
            description: 'Directory to search from (relative to workdir or absolute). Default: workdir.',
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

    const matches = await listSearchableFiles(rootDir, args.pattern)
    if (matches.length === 0) {
      return helpers.success('No files matched.')
    }

    const truncated = matches.length > OUTPUT_LIMITS.glob.maxResults
    const shown = matches.slice(0, OUTPUT_LIMITS.glob.maxResults)
    const output = truncated
      ? `${shown.join('\n')}\n\n[${matches.length - shown.length} more matches omitted — narrow the pattern]`
      : shown.join('\n')

    return helpers.success(output, truncated)
  },
)
