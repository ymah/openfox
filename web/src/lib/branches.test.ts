import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRANCH_START_KEY, followNewVersion, turnInfoForMessage, variantPosition } from './branches'

const authFetch = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))
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

describe('followNewVersion', () => {
  afterEach(() => {
    vi.useRealTimers()
    authFetch.mockReset()
  })

  const reply = (isRunning: boolean, count: number) => ({
    ok: true,
    json: () => Promise.resolve({ session: { isRunning }, messages: new Array(count).fill({}) }),
  })

  it('reloads once, after the version has finished', async () => {
    vi.useFakeTimers()
    authFetch
      .mockResolvedValueOnce(reply(false, 1)) // queued, not started
      .mockResolvedValueOnce(reply(true, 2)) // running
      .mockResolvedValueOnce(reply(false, 3)) // done
    const reload = vi.fn()
    const done = followNewVersion('v2', reload, { intervalMs: 10 })
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledWith('v2', true)
    expect(authFetch).toHaveBeenCalledTimes(3)
  })

  it('gives up quietly when the session cannot be read or never finishes', async () => {
    vi.useFakeTimers()
    authFetch.mockResolvedValue({ ok: false })
    const reload = vi.fn()
    const done = followNewVersion('v2', reload, { intervalMs: 10 })
    await vi.advanceTimersByTimeAsync(50)
    await done
    expect(reload).not.toHaveBeenCalled()

    authFetch.mockReset()
    authFetch.mockResolvedValue(reply(true, 2))
    const stuck = followNewVersion('v2', reload, { intervalMs: 10, maxWaitMs: 40 })
    await vi.advanceTimersByTimeAsync(200)
    await stuck
    expect(reload).not.toHaveBeenCalled()
  })
})
