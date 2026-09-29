import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { closeDatabase, getDatabase, initDatabase } from './index.js'
import { createProject } from './projects.js'
import { createSession, deleteSession } from './sessions.js'
import { recordBranch } from './session-branches.js'
import { EventStore } from '../events/store.js'
import type { TurnEvent } from '../events/types.js'
import {
  SEARCH_INDEX_VERSION_KEY,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  backfillMessageSearch,
  buildFtsQuery,
  reindexSession,
  searchMessages,
} from './message-search.js'

describe('buildFtsQuery', () => {
  it('turns words into an AND of prefixes and drops punctuation and quotes', () => {
    expect(buildFtsQuery('Lyon café')).toBe('"Lyon"* AND "café"*')
    expect(buildFtsQuery('say "hello" (world)!')).toBe('"say"* AND "hello"* AND "world"*')
  })

  it('cannot be turned into FTS syntax', () => {
    expect(buildFtsQuery('foo OR NOT bar*')).toBe('"foo"* AND "OR"* AND "NOT"* AND "bar"*')
    expect(buildFtsQuery('a" NEAR("b')).toBe('"a"* AND "NEAR"* AND "b"*')
  })

  it('has nothing to search for with no words or a single character', () => {
    expect(buildFtsQuery('')).toBeNull()
    expect(buildFtsQuery('  !? ')).toBeNull()
    expect(buildFtsQuery('a')).toBeNull()
  })

  it('caps the number of words', () => {
    expect(buildFtsQuery('a1 b2 c3 d4 e5 f6 g7 h8 i9 j10')!.split(' AND ')).toHaveLength(8)
  })
})

describe('message search index', () => {
  let root: string
  let projectId: string
  let sessionId: string
  let store: EventStore

  const userMessage = (id: string, content: string, extra: Record<string, unknown> = {}): TurnEvent => ({
    type: 'message.start',
    data: { messageId: id, role: 'user', content, ...extra },
  })
  const assistantReply = (id: string, ...chunks: string[]): TurnEvent[] => [
    { type: 'message.start', data: { messageId: id, role: 'assistant' } },
    ...chunks.map((content): TurnEvent => ({ type: 'message.delta', data: { messageId: id, content } })),
    { type: 'message.done', data: { messageId: id } },
  ]
  const append = (events: TurnEvent[], sid = sessionId) => events.forEach((e) => store.append(sid, e))
  const hits = (query: string, options: { projectId?: string } = {}) => searchMessages({ query, ...options })

  beforeEach(async () => {
    closeDatabase()
    const config = loadConfig()
    config.database.path = ':memory:'
    initDatabase(config)
    store = new EventStore(getDatabase())
    root = await mkdtemp(join(tmpdir(), 'openfox-search-'))
    projectId = createProject('P', root).id
    sessionId = createSession(projectId, root, 'Trip planning').id
  })

  afterEach(async () => {
    closeDatabase()
    await rm(root, { recursive: true, force: true })
  })

  it('finds a user message and an assistant reply written in chunks', () => {
    append([
      userMessage('u1', 'Où passer mes vacances en Bretagne ?'),
      ...assistantReply('a1', 'Essayez la baie de ', 'Douarnenez en juin.'),
    ])
    expect(hits('bretagne').map((h) => [h.messageId, h.role])).toEqual([['u1', 'user']])
    expect(hits('douarnenez juin').map((h) => [h.messageId, h.role])).toEqual([['a1', 'assistant']])
  })

  it('ignores accents and case, and matches word starts', () => {
    append([userMessage('u1', 'Le café de Lyon était EXCELLENT')])
    expect(hits('cafe')).toHaveLength(1)
    expect(hits('LYO')).toHaveLength(1)
    expect(hits('excellent lyon')).toHaveLength(1)
    expect(hits('excellent paris')).toHaveLength(0)
  })

  it('returns a snippet with the matched words marked, plus the session title and project', () => {
    append([userMessage('u1', 'I would like a recipe for spicy noodles tonight')])
    const [hit] = hits('noodles')
    expect(hit!.snippet).toContain(`${SNIPPET_OPEN}noodles${SNIPPET_CLOSE}`)
    expect(hit).toMatchObject({ sessionId, title: 'Trip planning', projectId })
  })

  it('leaves out system-generated messages, sub-agent output and tool results', () => {
    append([
      userMessage('u1', 'visible question about zebras'),
      userMessage('u2', 'injected reminder about zebras', { isSystemGenerated: true }),
      { type: 'message.start', data: { messageId: 'sub', role: 'assistant', subAgentId: 'x' } },
      { type: 'message.delta', data: { messageId: 'sub', content: 'sub agent zebras' } },
      { type: 'message.done', data: { messageId: 'sub' } },
      { type: 'tool.result', data: { callId: 'c', result: { output: 'tool output zebras' } } } as unknown as TurnEvent,
    ])
    expect(hits('zebras').map((h) => h.messageId)).toEqual(['u1'])
  })

  it('does not index an assistant message that said nothing (tool-only turn)', () => {
    append(assistantReply('a1'))
    expect(hits('anything')).toEqual([])
  })

  it('scopes to a project', () => {
    const other = createProject('Other', join(root, 'other'))
    const otherSession = createSession(other.id, join(root, 'other'), 'Other chat').id
    append([userMessage('u1', 'quantum sandwiches')])
    append([userMessage('u9', 'quantum sandwiches')], otherSession)
    expect(hits('quantum')).toHaveLength(2)
    expect(hits('quantum', { projectId: other.id }).map((h) => h.sessionId)).toEqual([otherSession])
  })

  it('does not list regenerated versions on their own', () => {
    const version = createSession(projectId, root, 'Trip planning').id
    append([userMessage('u1', 'unique rhubarb question')])
    append([userMessage('u2', 'unique rhubarb question')], version)
    recordBranch(version, sessionId, null)
    expect(hits('rhubarb').map((h) => h.sessionId)).toEqual([sessionId])
  })

  it('forgets a deleted conversation', () => {
    append([userMessage('u1', 'ephemeral pineapple thoughts')])
    expect(hits('pineapple')).toHaveLength(1)
    deleteSession(sessionId)
    expect(hits('pineapple')).toEqual([])
  })

  it('indexes a fork or import that carries its history as a snapshot', () => {
    store.append(sessionId, {
      type: 'turn.snapshot',
      data: {
        messages: [
          { id: 's1', role: 'user', content: 'snapshot question about tortoises' },
          { id: 's2', role: 'assistant', content: 'tortoises live long' },
          { id: 's3', role: 'user', content: 'generated tortoises', isSystemGenerated: true },
        ],
      },
    } as unknown as TurnEvent)
    expect(
      hits('tortoises')
        .map((h) => h.messageId)
        .sort(),
    ).toEqual(['s1', 's2'])
  })

  it('rebuilds after history is rewritten', () => {
    append([userMessage('u1', 'first walrus question'), ...assistantReply('a1', 'walrus answer')])
    expect(hits('walrus')).toHaveLength(2)
    getDatabase().prepare('DELETE FROM events WHERE session_id = ? AND seq > 1').run(sessionId)
    reindexSession(getDatabase(), sessionId)
    expect(hits('walrus').map((h) => h.messageId)).toEqual(['u1'])
  })

  it('backfills conversations that predate the index, once', async () => {
    append([userMessage('u1', 'legacy question about llamas')])
    getDatabase().prepare('DELETE FROM message_search').run() // as if the index never existed
    expect(hits('llamas')).toEqual([])

    expect(await backfillMessageSearch(getDatabase())).toBe(1)
    expect(hits('llamas')).toHaveLength(1)
    expect(
      getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(SEARCH_INDEX_VERSION_KEY),
    ).toBeDefined()
    expect(await backfillMessageSearch(getDatabase())).toBe(0) // already done
  })

  it('a bad query returns nothing instead of throwing', () => {
    append([userMessage('u1', 'plain text')])
    expect(hits('"')).toEqual([])
    expect(hits('')).toEqual([])
  })
})
