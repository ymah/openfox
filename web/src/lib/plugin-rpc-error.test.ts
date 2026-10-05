import { afterEach, describe, expect, it, vi } from 'vitest'

const authFetch = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ authFetch: (...args: unknown[]) => authFetch(...args) }))

import { invokePluginRpc, PluginRpcError } from './plugin-actions'

afterEach(() => authFetch.mockReset())

describe('invokePluginRpc errors', () => {
  it('keeps the status and the code a method raised', async () => {
    authFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Scene not found', code: 'not_found' }),
    })
    const error = await invokePluginRpc('p', 'scene.get').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PluginRpcError)
    expect(error).toMatchObject({ message: 'Scene not found', status: 404, code: 'not_found' })
  })

  it('still fails with a readable message when the body is not JSON', async () => {
    authFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    })
    const error = await invokePluginRpc('p', 'm').catch((e: unknown) => e)
    expect(error).toMatchObject({ message: 'Plugin RPC failed (502)', status: 502 })
  })

  it('returns the result on success', async () => {
    authFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: { a: 1 } }) })
    await expect(invokePluginRpc('p', 'm')).resolves.toEqual({ a: 1 })
  })
})
