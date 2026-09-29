import type { Session } from '../../shared/types.js'
import { getBranch } from '../db/session-branches.js'

/**
 * Build the Session object sent to clients.
 * Full messages travel in the dedicated `messages` payload field (already
 * truncated server-side); embedding them again in `session.messages` would
 * double the payload for long sessions. `messageCount` is guaranteed so the
 * client can rely on it instead of `messages.length`.
 */
export function toClientSession(session: Session): Session {
  const parentSessionId = parentOf(session.id)
  return {
    ...session,
    ...(parentSessionId ? { parentSessionId } : {}),
    messageCount: session.messageCount ?? session.messages.length,
    messages: [],
  }
}

/** The session this one was branched from, if it is a regenerated/edited version. */
function parentOf(sessionId: string): string | undefined {
  try {
    return getBranch(sessionId)?.parentSessionId
  } catch {
    return undefined // no database (unit tests that only exercise the mapping)
  }
}
