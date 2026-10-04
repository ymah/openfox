import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
let currentSession: unknown = null
vi.mock('./ws', () => ({ wsClient: { send: (...args: unknown[]) => send(...args) } }))
vi.mock('../stores/session', () => ({ useSessionStore: { getState: () => ({ currentSession }) } }))

import { checkDynamicContext } from './context-sync'

beforeEach(() => {
  send.mockReset()
  currentSession = null
})

describe('checkDynamicContext', () => {
  it('sends nothing when no session is open', () => {
    checkDynamicContext()
    expect(send).not.toHaveBeenCalled()
  })

  it('asks the server when a session is open', () => {
    currentSession = { id: 's1' }
    checkDynamicContext()
    expect(send).toHaveBeenCalledWith('context.checkDynamic', {})
  })

  it('survives a disconnected socket', () => {
    currentSession = { id: 's1' }
    send.mockImplementation(() => {
      throw new Error('not connected')
    })
    expect(() => checkDynamicContext()).not.toThrow()
  })
})
