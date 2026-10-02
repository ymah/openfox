import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import type { Message } from '@shared/types.js'
import { useT } from '../../hooks/useT'
import { useSessionStore } from '../../stores/session'
import { useCurrentProject } from '../../hooks/useCurrentProject'
import { getProjectMode } from '../../lib/project-modes'
import {
  branchFromMessage,
  fetchBranchVariants,
  followNewVersion,
  turnInfoForMessage,
  variantPosition,
} from '../../lib/branches'

// Typographic arrows: neither is translatable text.
const PREVIOUS_GLYPH = '‹'
const NEXT_GLYPH = '›'

/**
 * Under the last assistant message of a turn in a chat project: "< 2/3 >" to
 * move between alternative replies, and Regenerate, which keeps the current
 * reply and produces another as a new branch.
 */
export function ChatMessageActions({ message, sessionId }: { message: Message; sessionId: string }) {
  // Chat projects only. The gate sits outside the store subscriptions below so
  // that every other project type pays nothing for it, however long the feed.
  const project = useCurrentProject()
  if (getProjectMode(project?.type).chatChrome !== true || !project) return null
  return <ChatMessageActionsInner message={message} sessionId={sessionId} projectId={project.id} />
}

function ChatMessageActionsInner({
  message,
  sessionId,
  projectId,
}: {
  message: Message
  sessionId: string
  projectId: string
}) {
  const t = useT()
  const [, navigate] = useLocation()
  // Primitive selectors: streaming replaces the messages array on every delta, and
  // a selector returning the array would re-render every reply in the feed each time.
  const turnKey = useSessionStore((state) => {
    const turn = turnInfoForMessage(state.messages ?? [], message.id)
    return turn?.isLastOfTurn ? turn.key : null
  })
  const messageCount = useSessionStore((state) => state.messages?.length ?? 0)
  const isRunning = useSessionStore((state) => state.currentSession?.isRunning ?? false)
  const loadSession = useSessionStore((state) => state.loadSession)
  const [variants, setVariants] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (turnKey === null || isRunning) return
    let cancelled = false
    void fetchBranchVariants(sessionId)
      .then((v) => !cancelled && setVariants(v))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [turnKey, sessionId, isRunning, messageCount])

  if (turnKey === null || message.isStreaming) return null

  const position = variantPosition(variants, turnKey, sessionId)
  const go = (id: string | undefined) => {
    if (id) navigate(`/p/${projectId}/s/${id}`)
  }

  async function regenerate() {
    if (pending || isRunning) return
    setPending(true)
    setError(null)
    const result = await branchFromMessage(sessionId, message.id)
    setPending(false)
    if ('error' in result) setError(result.error)
    else {
      // The new version starts running as it is created, so the client has already seen
      // some of its events while on another session; load it afresh rather than trust a
      // partial cached pane.
      void loadSession(result.session.id, true)
      void followNewVersion(result.session.id, loadSession)
      navigate(`/p/${result.session.projectId}/s/${result.session.id}`)
    }
  }

  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-text-muted" data-testid="chat-message-actions">
      {position && (
        <span className="inline-flex items-center gap-1" data-testid="branch-nav">
          <button
            type="button"
            onClick={() => go(position.ids[position.index - 1])}
            disabled={position.index === 0}
            aria-label={t({ en: 'Previous version', fr: 'Version précédente' })}
            className="px-1 hover:text-text-primary disabled:opacity-30"
          >
            {PREVIOUS_GLYPH}
          </button>
          <span data-testid="branch-position">{`${position.index + 1}/${position.total}`}</span>
          <button
            type="button"
            onClick={() => go(position.ids[position.index + 1])}
            disabled={position.index === position.total - 1}
            aria-label={t({ en: 'Next version', fr: 'Version suivante' })}
            className="px-1 hover:text-text-primary disabled:opacity-30"
          >
            {NEXT_GLYPH}
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={pending || isRunning}
        data-testid="chat-regenerate"
        className="hover:text-text-primary disabled:opacity-40"
      >
        {pending ? t({ en: 'Regenerating…', fr: 'Régénération…' }) : t({ en: 'Regenerate', fr: 'Régénérer' })}
      </button>
      {error && <span className="text-accent-error">{error}</span>}
    </div>
  )
}
