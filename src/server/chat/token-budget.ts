import type { RequestContextMessage } from './request-context.js'

/** Rough token estimate: ~4 chars per token, matching the tool-definition estimate in mcp/manager.ts. */
export const CHARS_PER_TOKEN = 4

/** JSON framing overhead per tool message (role, tool_call_id, content key). */
export const TOOL_MESSAGE_OVERHEAD_TOKENS = 16

export function estimateToolResultTokens(toolMessages: Array<Pick<RequestContextMessage, 'content'>>): number {
  return toolMessages.reduce(
    (sum, message) => sum + TOOL_MESSAGE_OVERHEAD_TOKENS + Math.ceil(message.content.length / CHARS_PER_TOKEN),
    0,
  )
}

interface EstimableMessage {
  content: string
  toolCalls?: Array<{ arguments: Record<string, unknown> }>
}

/**
 * Rough token estimate for an assembled request (system prompt + messages +
 * tool defs), same ~4 chars/token heuristic. Sums each message's raw
 * `content` length (like estimateToolResultTokens) rather than
 * JSON.stringify-ing the whole messages array — content often already holds
 * JSON/code (file reads, grep results), and re-serializing it doubles the
 * escaping of every embedded quote/backslash, wildly inflating the estimate.
 */
export function estimatePromptTokens(
  systemPrompt: string,
  messages: readonly EstimableMessage[],
  tools: readonly unknown[],
): number {
  const messageTokens = messages.reduce((sum, message) => {
    const toolCallChars = (message.toolCalls ?? []).reduce(
      (s, toolCall) => s + JSON.stringify(toolCall.arguments).length,
      0,
    )
    return sum + TOOL_MESSAGE_OVERHEAD_TOKENS + Math.ceil((message.content.length + toolCallChars) / CHARS_PER_TOKEN)
  }, 0)
  const systemAndToolsTokens = Math.ceil((systemPrompt.length + JSON.stringify(tools).length) / CHARS_PER_TOKEN)
  return systemAndToolsTokens + messageTokens
}

const CONTEXT_LENGTH_ERROR_PATTERN = /context\s*length|context_length|context window|prompt (?:is )?too long/i

export function isContextLengthError(message: string | undefined): boolean {
  if (!message) return false
  return CONTEXT_LENGTH_ERROR_PATTERN.test(message)
}
