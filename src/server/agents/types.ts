/**
 * Agent System Types
 */

export interface AgentMetadata {
  id: string
  name: string
  description: string
  subagent: boolean
  allowedTools: string[]
  color?: string
  category?: string
  results?: string[]
  /**
   * Which base system prompt the agent runs under. Absent = the coding-agent
   * prompt shared by every built-in agent. 'assistant' = a general-purpose
   * conversational prompt with no software-engineering rules.
   */
  basePrompt?: BasePromptVariant
  /**
   * Send only the tool definitions this agent may use, instead of the full
   * set. Top-level agents normally receive every definition (only execution is
   * restricted) to keep the provider's prefix cache shared across agents; an
   * agent that never leaves its own tool set can trade that for a much smaller
   * prompt.
   */
  filterTools?: boolean
}

export type BasePromptVariant = 'assistant'

export const BASE_PROMPT_VARIANTS: readonly BasePromptVariant[] = ['assistant']

export interface AgentDefinition {
  metadata: AgentMetadata
  prompt: string
}

export function isBasePromptVariant(value: unknown): value is BasePromptVariant {
  return typeof value === 'string' && (BASE_PROMPT_VARIANTS as readonly string[]).includes(value)
}
