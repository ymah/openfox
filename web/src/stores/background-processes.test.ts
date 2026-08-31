// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useBackgroundProcessesStore } from './background-processes'

vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))

vi.mock('../lib/api', () => ({
  authFetch: vi.fn(),
}))

describe('useBackgroundProcessesStore', () => {
  beforeEach(() => {
    useBackgroundProcessesStore.setState({ processes: [], logs: {} })
  })

  describe('handleMessage backgroundProcess.started', () => {
    it('registers the process with its launch command and working directory', () => {
      useBackgroundProcessesStore.getState().handleMessage('backgroundProcess.started', {
        processId: 'proc-1',
        name: 'dev-server',
        command: 'npm run dev',
        cwd: '/project',
        pid: 4321,
        status: 'running',
      })

      const processes = useBackgroundProcessesStore.getState().processes
      expect(processes).toHaveLength(1)
      expect(processes[0]).toMatchObject({
        id: 'proc-1',
        name: 'dev-server',
        command: 'npm run dev',
        cwd: '/project',
        pid: 4321,
        status: 'running',
      })
    })
  })

  describe('log growth cap', () => {
    it('caps appendLog output at MAX_LOG_LINES instead of growing without bound', async () => {
      const store = useBackgroundProcessesStore.getState()
      for (let i = 0; i < 2100; i++) {
        store.appendLog('proc-1', 'stdout', `line ${i}`)
      }
      // appendLog batches through requestAnimationFrame; let the flush run.
      await new Promise((resolve) => setTimeout(resolve, 10))

      const lines = useBackgroundProcessesStore.getState().logs['proc-1'] ?? []
      expect(lines.length).toBe(2000)
      expect(lines[0]?.content).toBe('line 100')
      expect(lines[lines.length - 1]?.content).toBe('line 2099')
    })

    it('caps setLogs at MAX_LOG_LINES too', () => {
      const bigLogs = Array.from({ length: 2500 }, (_, i) => ({
        offset: i,
        content: `line ${i}`,
        timestamp: i,
        stream: 'stdout' as const,
      }))

      useBackgroundProcessesStore.getState().setLogs('proc-2', bigLogs)

      const lines = useBackgroundProcessesStore.getState().logs['proc-2'] ?? []
      expect(lines.length).toBe(2000)
      expect(lines[0]?.content).toBe('line 500')
      expect(lines[lines.length - 1]?.content).toBe('line 2499')
    })

    it('caps logs by total bytes, not just line count', () => {
      // Each "line" is really an output chunk of arbitrary size, so a few
      // huge chunks stay under the line cap while pinning megabytes.
      const oneMb = 'x'.repeat(1024 * 1024)
      const bigLogs = Array.from({ length: 6 }, (_, i) => ({
        offset: i,
        content: oneMb,
        timestamp: i,
        stream: 'stdout' as const,
      }))

      useBackgroundProcessesStore.getState().setLogs('proc-bytes', bigLogs)

      const lines = useBackgroundProcessesStore.getState().logs['proc-bytes'] ?? []
      expect(lines.length).toBeLessThan(6)
      expect(lines.reduce((sum, l) => sum + l.content.length, 0)).toBeLessThanOrEqual(2 * 1024 * 1024)
    })

    it('trims an exited process to a smaller tail but keeps its outcome readable', () => {
      const logs = Array.from({ length: 1500 }, (_, i) => ({
        offset: i,
        content: `line ${i}`,
        timestamp: i,
        stream: 'stdout' as const,
      }))
      useBackgroundProcessesStore.setState({
        processes: [{ id: 'proc-3', status: 'running' } as never],
        logs: { 'proc-3': logs },
      })

      useBackgroundProcessesStore.getState().handleMessage('backgroundProcess.exited', {
        processId: 'proc-3',
        exitCode: 0,
      })

      const lines = useBackgroundProcessesStore.getState().logs['proc-3'] ?? []
      // Trimmed (no more output is coming) but the tail — what the user
      // actually reads to see how it ended — is preserved.
      expect(lines.length).toBe(500)
      expect(lines[lines.length - 1]?.content).toBe('line 1499')
      expect(useBackgroundProcessesStore.getState().processes[0]?.status).toBe('exited')
    })
  })
})
