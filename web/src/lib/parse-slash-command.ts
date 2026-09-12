import type { WorkflowParameter, WorkflowScope } from '@shared/types.js'

export interface WorkflowInfo {
  id: string
  name: string
  parameters?: WorkflowParameter[]
  /** Which scope this definition lives in (server-annotated). */
  scope: WorkflowScope
}

export interface CommandInfo {
  id: string
  name: string
  paramNames?: string[]
}

export interface SlashCommandResult {
  workflowId?: string
  commandId?: string
  params: Record<string, string>
}

/**
 * Extract template parameter placeholders ({{name}}) from a template string.
 * Returns them in order of first occurrence, deduplicated.
 */
export function extractTemplateParams(template: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  const regex = /\{\{(\w+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(template)) !== null) {
    const key = match[1]!
    if (!seen.has(key)) {
      seen.add(key)
      result.push(key)
    }
  }
  return result
}

/**
 * Legacy alias — use extractTemplateParams instead.
 * @deprecated
 */
export const extractPositionalParams = extractTemplateParams

/**
 * Parse a slash command from chat input.
 * Returns null if the input is not a recognized slash command.
 */
export function parseSlashCommand(
  input: string,
  workflows: WorkflowInfo[],
  commands?: CommandInfo[],
): SlashCommandResult | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const parts = trimmed.slice(1).split(/\s+/)
  const id = parts[0]
  if (!id) return null

  const args = parts.slice(1)
  const params: Record<string, string> = {}

  // Try workflow first
  const wf = workflows.find((w) => w.id === id)
  if (wf) {
    if (wf.parameters && wf.parameters.length > 0) {
      const sorted = [...wf.parameters].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      sorted.forEach((p, i) => {
        if (args[i] === undefined) return
        // The last parameter is greedy — it absorbs every remaining word
        // instead of just the next token. Most trailing workflow parameters
        // are free-text ("idée", "résumé de la scène en une phrase", …), so
        // a strict one-token-per-slot mapping would silently drop the rest
        // of what the user typed.
        const isLast = i === sorted.length - 1
        params[p.id] = isLast ? args.slice(i).join(' ') : args[i]!
      })
    } else {
      args.forEach((arg, i) => {
        params[String(i)] = arg
      })
    }
    return { workflowId: id, params }
  }

  // Then try command
  if (commands) {
    const cmd = commands.find((c) => c.id === id)
    if (cmd) {
      args.forEach((arg, i) => {
        params[String(i)] = arg
      })
      return { commandId: id, params }
    }
  }

  return null
}
