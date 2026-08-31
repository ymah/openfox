// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDevServerStore } from './dev-server'
import type { DevServerStatus } from '@shared/dev-server.js'

vi.mock('../lib/api', () => ({
  authFetch: vi.fn(),
}))

const { authFetch } = vi.mocked(await import('../lib/api'))

const WORKDIR_A = '/projects/a'
const WORKDIR_B = '/projects/b'

const STATUS_RUNNING: DevServerStatus = {
  state: 'running',
  url: 'http://localhost:3000',
  hotReload: false,
  config: { command: 'npm run dev', url: 'http://localhost:3000', hotReload: false, disableInspect: false },
  errorMessage: undefined,
  inspectProxyPort: 9333,
}

const STATUS_STOPPED: DevServerStatus = {
  state: 'off',
  url: null,
  hotReload: false,
  config: null,
  errorMessage: undefined,
  inspectProxyPort: null,
}

const entryOf = (workdir: string) => useDevServerStore.getState().byWorkdir[workdir]

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

beforeEach(() => {
  useDevServerStore.setState({ byWorkdir: {} })
  vi.mocked(authFetch).mockReset()
})

describe('useDevServerStore per-workdir isolation', () => {
  it('keeps status and logs independent per workdir', async () => {
    vi.mocked(authFetch).mockImplementation(async (url: string) => {
      const running = url.startsWith('/api/dev-server/start?workdir=' + encodeURIComponent(WORKDIR_A))
      return {
        ok: true,
        json: async () => (running ? STATUS_RUNNING : STATUS_STOPPED),
      }
    })

    await useDevServerStore.getState().start(WORKDIR_A)

    expect(entryOf(WORKDIR_A)?.status).toEqual(STATUS_RUNNING)
    expect(entryOf(WORKDIR_B)?.status).toBeUndefined()
  })

  it('routes devServer.state messages to the matching workdir only', () => {
    useDevServerStore.getState().handleMessage({
      type: 'devServer.state',
      payload: { workdir: WORKDIR_A, state: 'running', errorMessage: undefined },
    })
    useDevServerStore.getState().handleMessage({
      type: 'devServer.state',
      payload: { workdir: WORKDIR_B, state: 'warning', errorMessage: 'boom' },
    })

    expect(entryOf(WORKDIR_A)?.status?.state).toBe('running')
    expect(entryOf(WORKDIR_B)?.status?.state).toBe('warning')
    expect(entryOf(WORKDIR_B)?.status?.errorMessage).toBe('boom')
  })

  it('routes devServer.output chunks to the matching workdir logs only', async () => {
    useDevServerStore.getState().handleMessage({
      type: 'devServer.output',
      payload: { workdir: WORKDIR_A, stream: 'stdout', content: 'hello A' },
    })
    useDevServerStore.getState().handleMessage({
      type: 'devServer.output',
      payload: { workdir: WORKDIR_B, stream: 'stderr', content: 'hello B' },
    })
    await nextFrame()

    expect(entryOf(WORKDIR_A)?.logs).toEqual([{ stream: 'stdout', content: 'hello A' }])
    expect(entryOf(WORKDIR_B)?.logs).toEqual([{ stream: 'stderr', content: 'hello B' }])
  })

  it('caps per-workdir logs to a bounded buffer so memory stays finite', async () => {
    for (let i = 0; i < 2500; i++) {
      useDevServerStore.getState().handleMessage({
        type: 'devServer.output',
        payload: { workdir: WORKDIR_A, stream: 'stdout', content: `line-${i}` },
      })
    }
    await nextFrame()

    const logs = entryOf(WORKDIR_A)?.logs ?? []
    expect(logs).toHaveLength(2000)
    expect(logs[0]?.content).toBe('line-500')
    expect(logs.at(-1)?.content).toBe('line-2499')
  })

  it('caps logs by total bytes, not just chunk count', async () => {
    // A chunk is a raw WS payload, not a line — a handful of megabyte-sized
    // chunks stays far under the 2000-chunk cap while pinning a lot of memory.
    const oneMb = 'x'.repeat(1024 * 1024)
    for (let i = 0; i < 6; i++) {
      useDevServerStore.getState().handleMessage({
        type: 'devServer.output',
        payload: { workdir: WORKDIR_A, stream: 'stdout', content: oneMb },
      })
    }
    await nextFrame()

    const logs = entryOf(WORKDIR_A)?.logs ?? []
    expect(logs.length).toBeLessThan(6)
    const totalBytes = logs.reduce((sum, log) => sum + log.content.length, 0)
    expect(totalBytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  })

  it('evicts least-recently-used workdirs so byWorkdir cannot grow forever', async () => {
    for (let i = 0; i < 8; i++) {
      useDevServerStore.getState().handleMessage({
        type: 'devServer.output',
        payload: { workdir: `/projects/w${i}`, stream: 'stdout', content: `out-${i}` },
      })
      await nextFrame()
    }

    const keys = Object.keys(useDevServerStore.getState().byWorkdir)
    expect(keys.length).toBeLessThanOrEqual(5)
    // The most recently written workdir is always retained.
    expect(keys).toContain('/projects/w7')
    expect(keys).not.toContain('/projects/w0')
  })

  it('saveConfig persists config for the targeted workdir only', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ config: { command: 'npm run dev', url: 'http://localhost:3000' } }),
    } as Response)

    await useDevServerStore.getState().saveConfig(WORKDIR_A, {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      hotReload: false,
      disableInspect: false,
    })

    expect(entryOf(WORKDIR_A)?.config?.command).toBe('npm run dev')
    expect(entryOf(WORKDIR_B)).toBeUndefined()
  })

  it('actions are no-ops without a workdir', async () => {
    await useDevServerStore.getState().start(undefined as unknown as string)
    expect(authFetch).not.toHaveBeenCalled()
    expect(useDevServerStore.getState().byWorkdir).toEqual({})
  })
})
