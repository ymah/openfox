import type { Message } from '@shared/types.js'
import { authFetch } from './api'

/** Key for a branch that starts at the very first message (mirrors the server). */
export const BRANCH_START_KEY = '__start__'

export interface TurnInfo {
  /** The real user message that started this turn. */
  userMessageId: string
  /** Where alternatives diverge: the message before it, or BRANCH_START_KEY. */
  key: string
  /** True for the last assistant message before the next real user message. */
  isLastOfTurn: boolean
}

const isRealUser = (m: Message) => m.role === 'user' && !m.isSystemGenerated

/**
 * Where an assistant message sits in the conversation: which user message it
 * answers, the key its alternatives are stored under, and whether it closes the
 * turn (the reply that gets the "< 2/3 >" and Regenerate controls).
 */
export function turnInfoForMessage(messages: Message[], messageId: string): TurnInfo | null {
  const index = messages.findIndex((m) => m.id === messageId)
  if (index === -1 || messages[index]!.role !== 'assistant') return null

  let userIndex = index - 1
  while (userIndex >= 0 && !isRealUser(messages[userIndex]!)) userIndex--
  if (userIndex < 0) return null

  const previous = userIndex > 0 ? messages[userIndex - 1]! : null
  let isLastOfTurn = true
  for (let i = index + 1; i < messages.length; i++) {
    const m = messages[i]!
    if (isRealUser(m)) break
    if (m.role === 'assistant') {
      isLastOfTurn = false
      break
    }
  }
  return { userMessageId: messages[userIndex]!.id, key: previous?.id ?? BRANCH_START_KEY, isLastOfTurn }
}

/** Position of the current session among the alternatives at `key`, or null when there is only one. */
export function variantPosition(
  variants: Record<string, string[]>,
  key: string,
  sessionId: string,
): { index: number; total: number; ids: string[] } | null {
  const ids = variants[key]
  if (!ids || ids.length < 2) return null
  const index = ids.indexOf(sessionId)
  return index === -1 ? null : { index, total: ids.length, ids }
}

export async function fetchBranchVariants(sessionId: string): Promise<Record<string, string[]>> {
  const res = await authFetch(`/api/sessions/${sessionId}/versions`)
  if (!res.ok) return {}
  const data = (await res.json()) as { variants?: Record<string, string[]> }
  return data.variants ?? {}
}

export type BranchResult = { session: { id: string; projectId: string } } | { error: string }

/** Regenerate (no content) or edit-and-resend (with content) as a new branch. */
export async function branchFromMessage(
  sessionId: string,
  messageId: string,
  options: { content?: string; attachments?: unknown[] } = {},
): Promise<BranchResult> {
  try {
    const res = await authFetch(`/api/sessions/${sessionId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, ...options }),
    })
    const data = (await res.json().catch(() => ({}))) as { session?: { id: string; projectId: string }; error?: string }
    if (!res.ok || !data.session) return { error: data.error ?? `HTTP ${res.status}` }
    return { session: data.session }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
