import { describe, expect, it } from 'vitest'
import { RECENT_CONVERSATION_LIMIT, groupRecentConversations, startableAgents } from './utils'
import type { AgentInfo } from '@/lib/agents-actions'

const agent = (id: string, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id,
  name: id,
  description: '',
  subagent: false,
  allowedTools: [],
  ...extra,
})

describe('startableAgents', () => {
  it('keeps top-level chat agents only', () => {
    const agents = [
      agent('chat-assistant', { category: 'chat' }),
      agent('chat-sub', { category: 'chat', subagent: true }),
      agent('planner', { category: 'dev' }),
      agent('custom'),
    ]
    expect(startableAgents(agents).map((a) => a.id)).toEqual(['chat-assistant'])
  })
})

describe('groupRecentConversations', () => {
  const s = (id: string, updatedAt: string, extra = {}) => ({
    id,
    projectId: 'p1',
    title: id,
    isFavorite: false,
    updatedAt,
    ...extra,
  })

  it('scopes to the project, favourites first, then newest first', () => {
    const result = groupRecentConversations(
      [
        s('old', '2026-01-01T00:00:00Z'),
        s('new', '2026-03-01T00:00:00Z'),
        s('fav', '2026-02-01T00:00:00Z', { isFavorite: true }),
        s('elsewhere', '2026-04-01T00:00:00Z', { projectId: 'p2' }),
      ],
      'p1',
    )
    expect(result.map((c) => c.id)).toEqual(['fav', 'new', 'old'])
  })

  it('caps the list', () => {
    const many = Array.from({ length: RECENT_CONVERSATION_LIMIT + 10 }, (_, i) =>
      s(`c${i}`, new Date(2026, 0, 1 + i).toISOString()),
    )
    expect(groupRecentConversations(many, 'p1')).toHaveLength(RECENT_CONVERSATION_LIMIT)
  })
})
