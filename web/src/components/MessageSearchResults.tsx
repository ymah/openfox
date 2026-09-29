import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { useT } from '../hooks/useT'
import { searchMessages, splitSnippet, type MessageSearchHit } from '../lib/message-search'

/**
 * "Found in the text of conversations": full-text hits on what was actually said
 * (yours and the assistants'), beyond titles and the last few prompts the home
 * search already matches. `include` scopes hits to the tab being viewed.
 */
export function MessageSearchResults({
  query,
  include,
  onCount,
}: {
  query: string
  include: (projectId: string) => boolean
  onCount?: (count: number) => void
}) {
  const t = useT()
  const [hits, setHits] = useState<MessageSearchHit[]>([])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const controller = new AbortController()
    searchMessages(query, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setHits(found)
      })
      .catch(() => {
        if (!controller.signal.aborted) setHits([])
      })
    return () => controller.abort()
  }, [query])

  const visible = hits.filter((hit) => include(hit.projectId))
  useEffect(() => {
    onCount?.(visible.length)
  }, [visible.length, onCount])

  if (visible.length === 0) return null

  return (
    <section className="mt-4" data-testid="message-search-results">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
        {t({ en: 'In conversation text', fr: 'Dans le texte des conversations' })}
      </h3>
      <ul className="bg-bg-secondary border border-border rounded-lg overflow-hidden divide-y divide-border">
        {visible.map((hit) => (
          <li key={`${hit.sessionId}:${hit.messageId}`}>
            <Link
              href={`/p/${hit.projectId}/s/${hit.sessionId}`}
              className="block px-3 md:px-4 py-2 hover:bg-bg-tertiary/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm text-text-primary truncate flex-1 min-w-0">
                  {hit.title ?? hit.sessionId.slice(0, 8)}
                </span>
                <span className="text-[10px] text-text-muted shrink-0">
                  {hit.role === 'user' ? t({ en: 'you', fr: 'vous' }) : t({ en: 'assistant', fr: 'assistant' })}
                </span>
              </span>
              <span className="block text-xs text-text-muted mt-0.5 break-words">
                {splitSnippet(hit.snippet).map((part, i) =>
                  part.match ? (
                    <mark key={i} className="bg-accent-primary/25 text-text-primary rounded px-0.5">
                      {part.text}
                    </mark>
                  ) : (
                    <span key={i}>{part.text}</span>
                  ),
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
