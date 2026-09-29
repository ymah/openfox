import { authFetch } from './api'

// Match markers used by the server's snippet (kept in sync with db/message-search.ts).
const SNIPPET_OPEN = '\u0001'
const SNIPPET_CLOSE = '\u0002'

export interface MessageSearchHit {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
  title: string | null
  projectId: string
  updatedAt: string
}

export interface SnippetPart {
  text: string
  match: boolean
}

/** Split a server snippet into plain and matched runs, without ever treating the text as markup. */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let match = false
  for (const text of snippet.split(new RegExp(`[${SNIPPET_OPEN}${SNIPPET_CLOSE}]`, 'u'))) {
    // split() drops the delimiter, so track which one we crossed via positions
    if (text) parts.push({ text, match })
    match = !match
  }
  return parts
}

export async function searchMessages(query: string, signal?: AbortSignal): Promise<MessageSearchHit[]> {
  const res = await authFetch(`/api/search/messages?q=${encodeURIComponent(query)}&limit=30`, signal ? { signal } : {})
  if (!res.ok) return []
  const data = (await res.json()) as { hits?: MessageSearchHit[] }
  return data.hits ?? []
}
