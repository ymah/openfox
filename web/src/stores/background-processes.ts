import { create } from 'zustand'
import type { BackgroundProcess, LogLine } from '@shared/protocol.js'
// Authorized exception: background-process state is WS-driven; REST is a one-shot stop action.
import { authFetch } from '../lib/api'
import { createLogBuffer } from './utils'

interface BackgroundProcessStore {
  processes: BackgroundProcess[]
  logs: Record<string, LogLine[]>
  loading: boolean

  setProcesses: (processes: BackgroundProcess[]) => void
  addProcess: (process: BackgroundProcess) => void
  updateProcess: (processId: string, updates: Partial<BackgroundProcess>) => void
  removeProcess: (processId: string) => void
  stopProcess: (processId: string, sessionId: string) => Promise<void>
  appendLog: (processId: string, stream: 'stdout' | 'stderr', content: string) => void
  setLogs: (processId: string, logs: LogLine[]) => void
  clearLogs: (processId: string) => void
  handleMessage: (type: string, payload: Record<string, unknown>) => void
}

let logBuffer: { processId: string; stream: 'stdout' | 'stderr'; content: string }[] = []

// Sliding-window cap so a long-lived background process (a watch task, a
// tailed log, a dev server started via background_process) can't grow this
// store without bound — same pattern and limit as dev-server.ts's capLogs.
const MAX_LOG_LINES = 2000
// A "line" is really one output chunk of arbitrary length, so the count cap
// alone bounds nothing in memory — same reasoning as dev-server.ts.
const MAX_LOG_BYTES = 2 * 1024 * 1024
// A finished process keeps its logs so the user can still read the outcome,
// but on a much tighter budget: it will never produce more output, and
// exited processes otherwise accumulate for the whole session.
const EXITED_MAX_LOG_LINES = 500
const EXITED_MAX_LOG_BYTES = 256 * 1024

const capLogs = (lines: LogLine[], maxLines = MAX_LOG_LINES, maxBytes = MAX_LOG_BYTES): LogLine[] => {
  const capped = lines.length > maxLines ? lines.slice(-maxLines) : lines
  let bytes = 0
  let firstKept = capped.length
  for (let i = capped.length - 1; i >= 0; i--) {
    bytes += capped[i]!.content.length
    if (bytes > maxBytes) break
    firstKept = i
  }
  return firstKept === 0 ? capped : capped.slice(firstKept)
}

export const useBackgroundProcessesStore = create<BackgroundProcessStore>()((set, get) => {
  function flushLogBuffer() {
    if (logBuffer.length === 0) return
    const chunks = logBuffer
    logBuffer = []
    set((state) => {
      const newLogs = { ...state.logs }
      for (const chunk of chunks) {
        const existing = newLogs[chunk.processId] ?? []
        newLogs[chunk.processId] = capLogs([
          ...existing,
          { offset: existing.length, content: chunk.content, timestamp: Date.now(), stream: chunk.stream },
        ])
      }
      return { logs: newLogs }
    })
  }

  const scheduleLogFlush = createLogBuffer(flushLogBuffer)

  return {
    processes: [],
    logs: {},
    loading: false,

    setProcesses: (processes) => set({ processes }),

    addProcess: (process) =>
      set((state) => ({
        processes: [...state.processes, process],
      })),

    updateProcess: (processId, updates) =>
      set((state) => ({
        processes: state.processes.map((p) => (p.id === processId ? { ...p, ...updates } : p)),
      })),

    removeProcess: (processId) =>
      set((state) => ({
        processes: state.processes.filter((p) => p.id !== processId),
        logs: Object.fromEntries(Object.entries(state.logs).filter(([key]) => key !== processId)),
      })),

    stopProcess: async (processId, sessionId) => {
      try {
        const res = await authFetch(`/api/sessions/${sessionId}/background-process/${processId}/stop`, {
          method: 'POST',
        })
        if (res.ok) {
          get().removeProcess(processId)
        }
      } catch {
        // ignore
      }
    },

    appendLog: (processId, stream, content) => {
      logBuffer.push({ processId, stream, content })
      scheduleLogFlush()
    },

    setLogs: (processId, logs) =>
      set((state) => ({
        logs: { ...state.logs, [processId]: capLogs(logs) },
      })),

    clearLogs: (processId) =>
      set((state) => ({
        logs: { ...state.logs, [processId]: [] },
      })),

    handleMessage: (type, payload) => {
      switch (type) {
        case 'backgroundProcess.started': {
          const { processId, name, command, cwd, pid, status } = payload as {
            processId: string
            name: string
            command: string
            cwd: string
            pid: number
            status: string
          }
          set((state) => ({
            processes: [
              ...state.processes,
              {
                id: processId,
                sessionId: '',
                name,
                command,
                cwd,
                pid,
                status: status as BackgroundProcess['status'],
                exitCode: null,
                createdAt: Date.now(),
                startedAt: Date.now(),
                endedAt: null,
              },
            ],
          }))
          break
        }
        case 'backgroundProcess.output': {
          const processId = payload.processId as string
          const stream = payload.stream as 'stdout' | 'stderr'
          const content = payload.content as string
          get().appendLog(processId, stream, content)
          break
        }
        case 'backgroundProcess.exited': {
          const processId = payload.processId as string
          const exitCode = payload.exitCode as number | null
          set((state) => {
            const existing = state.logs[processId]
            return {
              processes: state.processes.map((p) => (p.id === processId ? { ...p, status: 'exited', exitCode } : p)),
              // Keep the tail (the outcome is what the user reads) on the
              // tighter exited budget — no more output is coming.
              logs: existing
                ? { ...state.logs, [processId]: capLogs(existing, EXITED_MAX_LOG_LINES, EXITED_MAX_LOG_BYTES) }
                : state.logs,
            }
          })
          break
        }
        case 'backgroundProcess.removed': {
          const processId = payload.processId as string
          get().removeProcess(processId)
          break
        }
      }
    },
  }
})
