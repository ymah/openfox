import type Database from 'better-sqlite3'
import { getDatabase } from './index.js'
import { logger } from '../utils/logger.js'

/**
 * Full-text search over what was actually said in conversations: your messages
 * and the assistants' replies (not tool output, thinking or system prompts).
 *
 * One FTS5 row per message. The index is derived data: it is kept up to date as
 * events are appended, rebuilt for a session when its history is rewritten, and
 * backfilled once for conversations that predate it. Every entry point swallows
 * its own errors — search must never be able to break a chat turn.
 */

export const SEARCH_INDEX_VERSION = '1'
export const SEARCH_INDEX_VERSION_KEY = 'search.indexVersion'

/** Wraps the matched words in a snippet; unlikely to occur in text, safe to split on. */
export const SNIPPET_OPEN = '\u0001'
export const SNIPPET_CLOSE = '\u0002'

const MAX_INDEXED_CHARS = 20_000

interface EventLike {
  type: string
  data: unknown
}

export function createMessageSearchTable(db: Database.Database): boolean {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
        content,
        session_id UNINDEXED,
        message_id UNINDEXED,
        role UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      )
    `)
    return true
  } catch (error) {
    // An SQLite build without FTS5: search is simply unavailable.
    logger.warn('Message search unavailable (FTS5 not supported)', { error: String(error) })
    return false
  }
}

function hasTable(db: Database.Database): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'message_search'").get() !== undefined
}

function put(db: Database.Database, sessionId: string, messageId: string, role: string, content: string): void {
  const text = content.trim().slice(0, MAX_INDEXED_CHARS)
  db.prepare('DELETE FROM message_search WHERE session_id = ? AND message_id = ?').run(sessionId, messageId)
  if (text) {
    db.prepare('INSERT INTO message_search (content, session_id, message_id, role) VALUES (?, ?, ?, ?)').run(
      text,
      sessionId,
      messageId,
      role,
    )
  }
}

/** Keep the index current as one event is appended to a session. Never throws. */
export function indexEventForSearch(db: Database.Database, sessionId: string, event: EventLike): void {
  try {
    if (!hasTable(db)) return
    const data = event.data as Record<string, unknown>

    if (event.type === 'message.start') {
      if (
        data['role'] === 'user' &&
        !data['isSystemGenerated'] &&
        !data['subAgentId'] &&
        typeof data['content'] === 'string'
      ) {
        put(db, sessionId, String(data['messageId']), 'user', data['content'])
      }
      return
    }

    if (event.type === 'message.done') {
      const messageId = String(data['messageId'])
      const start = db
        .prepare(
          `SELECT json_extract(payload, '$.role') AS role,
                  json_extract(payload, '$.subAgentId') AS sub_agent,
                  json_extract(payload, '$.isSystemGenerated') AS generated
           FROM events
           WHERE session_id = ? AND event_type = 'message.start' AND json_extract(payload, '$.messageId') = ?
           LIMIT 1`,
        )
        .get(sessionId, messageId) as
        { role: string | null; sub_agent: string | null; generated: number | null } | undefined
      if (start?.role !== 'assistant' || start.sub_agent || start.generated) return
      const row = db
        .prepare(
          `SELECT group_concat(json_extract(payload, '$.content'), '') AS content FROM (
             SELECT payload FROM events
             WHERE session_id = ? AND event_type = 'message.delta' AND json_extract(payload, '$.messageId') = ?
             ORDER BY seq)`,
        )
        .get(sessionId, messageId) as { content: string | null } | undefined
      if (row?.content) put(db, sessionId, messageId, 'assistant', row.content)
      return
    }

    // A snapshot that is the first thing indexed for a session is a fork or an
    // import, which carry their history as a snapshot rather than as events.
    if (event.type === 'turn.snapshot') {
      const indexed = db.prepare('SELECT 1 FROM message_search WHERE session_id = ? LIMIT 1').get(sessionId)
      if (!indexed) reindexSession(db, sessionId)
    }
  } catch (error) {
    logger.warn('Message search indexing failed', { sessionId, error: String(error) })
  }
}

interface Rebuilt {
  role: string
  content: string
  skip: boolean
}

/**
 * Rebuild a session's rows from its event history (latest snapshot, then the
 * events after it). Used for backfill, forks, imports and after a truncation.
 */
export function reindexSession(db: Database.Database, sessionId: string): void {
  try {
    if (!hasTable(db)) return
    const rows = db
      .prepare('SELECT event_type, payload FROM events WHERE session_id = ? ORDER BY seq')
      .all(sessionId) as Array<{ event_type: string; payload: string }>

    let messages = new Map<string, Rebuilt>()
    for (const row of rows) {
      const data = JSON.parse(row.payload) as Record<string, unknown>
      if (row.event_type === 'turn.snapshot') {
        messages = new Map()
        for (const message of (data['messages'] as Array<Record<string, unknown>> | undefined) ?? []) {
          messages.set(String(message['id']), {
            role: String(message['role']),
            content: typeof message['content'] === 'string' ? message['content'] : '',
            skip: Boolean(message['isSystemGenerated']) || Boolean(message['subAgentId']),
          })
        }
      } else if (row.event_type === 'message.start') {
        messages.set(String(data['messageId']), {
          role: String(data['role']),
          content: typeof data['content'] === 'string' ? data['content'] : '',
          skip: Boolean(data['isSystemGenerated']) || Boolean(data['subAgentId']),
        })
      } else if (row.event_type === 'message.delta') {
        const entry = messages.get(String(data['messageId']))
        if (entry && typeof data['content'] === 'string') entry.content += data['content']
      }
    }

    const rebuild = db.transaction(() => {
      db.prepare('DELETE FROM message_search WHERE session_id = ?').run(sessionId)
      for (const [messageId, entry] of messages) {
        if (!entry.skip && (entry.role === 'user' || entry.role === 'assistant')) {
          put(db, sessionId, messageId, entry.role, entry.content)
        }
      }
    })
    rebuild()
  } catch (error) {
    logger.warn('Message search reindex failed', { sessionId, error: String(error) })
  }
}

export function removeSessionFromSearch(db: Database.Database, sessionId: string): void {
  try {
    if (hasTable(db)) db.prepare('DELETE FROM message_search WHERE session_id = ?').run(sessionId)
  } catch (error) {
    logger.warn('Message search cleanup failed', { sessionId, error: String(error) })
  }
}

/**
 * Index every existing conversation once, yielding between sessions so a large
 * history never blocks the server. Records the index version when done, so it
 * runs once. Safe to call again: it only does work while the version is stale.
 */
export async function backfillMessageSearch(db: Database.Database = getDatabase()): Promise<number> {
  try {
    if (!hasTable(db)) return 0
    const current = db.prepare('SELECT value FROM settings WHERE key = ?').get(SEARCH_INDEX_VERSION_KEY) as
      { value: string } | undefined
    if (current?.value === SEARCH_INDEX_VERSION) return 0

    const ids = (db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>).map((r) => r.id)
    for (const id of ids) {
      reindexSession(db, id)
      await new Promise((resolve) => setImmediate(resolve))
    }
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(SEARCH_INDEX_VERSION_KEY, SEARCH_INDEX_VERSION, new Date().toISOString())
    logger.info('Message search index built', { sessions: ids.length })
    return ids.length
  } catch (error) {
    logger.warn('Message search backfill failed', { error: String(error) })
    return 0
  }
}

/**
 * A user's words as a safe FTS5 query: every word must match, each as a prefix
 * ("lyo" finds "Lyon"). Returns null when there is nothing worth searching for.
 */
export function buildFtsQuery(input: string): string | null {
  const words = (input.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8)
  if (words.length === 0 || words.join('').length < 2) return null
  return words.map((word) => `"${word}"*`).join(' AND ')
}

export interface MessageSearchHit {
  sessionId: string
  messageId: string
  role: 'user' | 'assistant'
  /** Text around the match; matched words are wrapped in SNIPPET_OPEN/SNIPPET_CLOSE. */
  snippet: string
  title: string | null
  projectId: string
  updatedAt: string
}

export function searchMessages(options: {
  query: string
  projectId?: string
  limit?: number
  offset?: number
}): MessageSearchHit[] {
  const match = buildFtsQuery(options.query)
  if (!match) return []
  const db = getDatabase()
  if (!hasTable(db)) return []

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const offset = Math.max(options.offset ?? 0, 0)
  const rows = db
    .prepare(
      `SELECT message_search.session_id AS session_id,
              message_search.message_id AS message_id,
              message_search.role AS role,
              snippet(message_search, 0, ?, ?, '…', 14) AS snippet,
              s.title AS title, s.project_id AS project_id, s.updated_at AS updated_at
       FROM message_search
       JOIN sessions s ON s.id = message_search.session_id
       WHERE message_search MATCH ?
         AND s.id NOT IN (SELECT session_id FROM session_branches)
         ${options.projectId ? 'AND s.project_id = ?' : ''}
       ORDER BY rank
       LIMIT ? OFFSET ?`,
    )
    .all(
      SNIPPET_OPEN,
      SNIPPET_CLOSE,
      match,
      ...(options.projectId ? [options.projectId] : []),
      limit,
      offset,
    ) as Array<{
    session_id: string
    message_id: string
    role: 'user' | 'assistant'
    snippet: string
    title: string | null
    project_id: string
    updated_at: string
  }>

  return rows.map((row) => ({
    sessionId: row.session_id,
    messageId: row.message_id,
    role: row.role,
    snippet: row.snippet,
    title: row.title,
    projectId: row.project_id,
    updatedAt: row.updated_at,
  }))
}
