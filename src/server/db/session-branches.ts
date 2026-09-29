import { getDatabase } from './index.js'

/**
 * Sentinel key for a branch that starts at the very first message, where there
 * is no earlier message to identify the divergence point by.
 */
export const BRANCH_START_KEY = '__start__'

export interface BranchRow {
  sessionId: string
  parentSessionId: string
  /** Last message shared with the parent; null when the branch starts at the beginning. */
  prevMessageId: string | null
  createdAt: string
}

interface RawRow {
  session_id: string
  parent_session_id: string
  prev_message_id: string | null
  created_at: string
}

const toRow = (r: RawRow): BranchRow => ({
  sessionId: r.session_id,
  parentSessionId: r.parent_session_id,
  prevMessageId: r.prev_message_id,
  createdAt: r.created_at,
})

export function recordBranch(sessionId: string, parentSessionId: string, prevMessageId: string | null): void {
  getDatabase()
    .prepare(
      'INSERT OR REPLACE INTO session_branches (session_id, parent_session_id, prev_message_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(sessionId, parentSessionId, prevMessageId, new Date().toISOString())
}

export function getBranch(sessionId: string): BranchRow | null {
  const row = getDatabase().prepare('SELECT * FROM session_branches WHERE session_id = ?').get(sessionId) as
    RawRow | undefined
  return row ? toRow(row) : null
}

export function listBranchChildren(parentSessionId: string): BranchRow[] {
  return (
    getDatabase()
      .prepare('SELECT * FROM session_branches WHERE parent_session_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(parentSessionId) as RawRow[]
  ).map(toRow)
}

/** True when the session was created as a branch of another one. */
export function isBranchSession(sessionId: string): boolean {
  return getBranch(sessionId) !== null
}

/**
 * The alternatives a session can switch to, keyed by divergence point (the last
 * shared message id, or BRANCH_START_KEY). Each list holds the original first,
 * then its branches in creation order, and always contains the session itself.
 *
 * A session sees the family it is directly part of: as a branch, the family it
 * was forked into; as an original, the branches forked from it. Deeper trees are
 * reached by stepping back to the session they were forked from.
 */
export function computeVariants(sessionId: string): Record<string, string[]> {
  const variants: Record<string, string[]> = {}
  const keyOf = (row: BranchRow) => row.prevMessageId ?? BRANCH_START_KEY

  const own = getBranch(sessionId)
  if (own) {
    const key = keyOf(own)
    const siblings = listBranchChildren(own.parentSessionId).filter((row) => keyOf(row) === key)
    variants[key] = [own.parentSessionId, ...siblings.map((row) => row.sessionId)]
  }

  for (const child of listBranchChildren(sessionId)) {
    const key = keyOf(child)
    if (variants[key]) continue
    variants[key] = [
      sessionId,
      ...listBranchChildren(sessionId)
        .filter((row) => keyOf(row) === key)
        .map((row) => row.sessionId),
    ]
  }
  return variants
}
