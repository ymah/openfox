import { describe, it, expect, vi } from 'vitest'
import type { TurnEvent } from '../events/types.js'

vi.mock('../events/index.js', () => ({
  getCurrentWindowMessageOptions: vi.fn(() => ({ contextWindowId: 'cw-1' })),
}))

import { drainQueue } from './drain-queue.js'

describe('drainQueue', () => {
  it('persists attachments and messageKind of ASAP messages drained mid-turn', () => {
    const attachments = [{ type: 'image', mimeType: 'image/png', data: 'AAAA', name: 'shot.png' }]
    const sessionManager = {
      drainAsapMessages: vi.fn(() => [
        { queueId: 'q-1', mode: 'asap', content: 'look at this', queuedAt: '', attachments, messageKind: 'command' },
      ]),
      getQueueState: vi.fn(() => []),
    } as any
    const append = vi.fn()
    const onMessage = vi.fn()

    const result = drainQueue(sessionManager, 'sess-1', append, onMessage)

    expect(result.hasMessages).toBe(true)
    const start = (append.mock.calls as Array<[TurnEvent]>).map(([e]) => e).find((e) => e.type === 'message.start')
    expect(start).toBeDefined()
    // Without this the image sent while the agent was running never reached
    // the event store — and therefore never reached the LLM.
    expect((start!.data as { attachments?: unknown[] }).attachments).toEqual(attachments)
    expect((start!.data as { messageKind?: string }).messageKind).toBe('command')
    expect((start!.data as { contextWindowId?: string }).contextWindowId).toBe('cw-1')

    const live = onMessage.mock.calls.map(([m]) => m).find((m) => m.type === 'chat.message')
    expect(live.payload.message.attachments).toEqual(attachments)
    expect(live.payload.message.messageKind).toBe('command')
  })
})
