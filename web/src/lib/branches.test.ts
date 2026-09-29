import { describe, expect, it } from 'vitest'
import { BRANCH_START_KEY, turnInfoForMessage, variantPosition } from './branches'
import type { Message } from '@shared/types.js'

const msg = (id: string, role: Message['role'], extra: Partial<Message> = {}): Message =>
  ({ id, role, content: id, timestamp: '2026-01-01T00:00:00Z', ...extra }) as Message

describe('turnInfoForMessage', () => {
  it('keys the first turn by the start sentinel', () => {
    const messages = [msg('u1', 'user'), msg('r1', 'user', { isSystemGenerated: true }), msg('a1', 'assistant')]
    expect(turnInfoForMessage(messages, 'a1')).toEqual({
      userMessageId: 'u1',
      key: BRANCH_START_KEY,
      isLastOfTurn: true,
    })
  })

  it('keys a later turn by the message that preceded its question', () => {
    const messages = [msg('u1', 'user'), msg('a1', 'assistant'), msg('u2', 'user'), msg('a2', 'assistant')]
    expect(turnInfoForMessage(messages, 'a2')).toMatchObject({ userMessageId: 'u2', key: 'a1' })
    expect(turnInfoForMessage(messages, 'a1')).toMatchObject({ userMessageId: 'u1', key: BRANCH_START_KEY })
  })

  it('only the last assistant message of a tool loop closes the turn', () => {
    const messages = [msg('u1', 'user'), msg('a1', 'assistant'), msg('t1', 'tool'), msg('a2', 'assistant')]
    expect(turnInfoForMessage(messages, 'a1')?.isLastOfTurn).toBe(false)
    expect(turnInfoForMessage(messages, 'a2')?.isLastOfTurn).toBe(true)
  })

  it('ignores non-assistant and unknown messages', () => {
    const messages = [msg('u1', 'user'), msg('a1', 'assistant')]
    expect(turnInfoForMessage(messages, 'u1')).toBeNull()
    expect(turnInfoForMessage(messages, 'nope')).toBeNull()
  })

  it('has no turn for an assistant message with no user message before it', () => {
    expect(turnInfoForMessage([msg('a1', 'assistant')], 'a1')).toBeNull()
  })
})

describe('variantPosition', () => {
  const variants = { [BRANCH_START_KEY]: ['s1', 's2', 's3'] }

  it('locates the session among its alternatives', () => {
    expect(variantPosition(variants, BRANCH_START_KEY, 's2')).toEqual({ index: 1, total: 3, ids: ['s1', 's2', 's3'] })
  })

  it('is null with a single version, an unknown key or a stranger session', () => {
    expect(variantPosition({ k: ['s1'] }, 'k', 's1')).toBeNull()
    expect(variantPosition(variants, 'other', 's1')).toBeNull()
    expect(variantPosition(variants, BRANCH_START_KEY, 'zzz')).toBeNull()
  })
})
