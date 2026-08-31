import { create } from 'zustand'
import type { DevServerConfig, DevServerState, DevServerStatus } from '@shared/dev-server.js'
import type { ServerMessage, DevServerOutputPayload, DevServerStatePayload } from '@shared/protocol.js'
// Authorized exception: dev-server state is WS-driven; REST is one-shot lifecycle actions (start/stop/marker) and list reads are fresh-on-mount polls.
import { authFetch } from '../lib/api'
import { createLogBuffer } from './utils'

interface LogChunk {
  stream: 'stdout' | 'stderr'
  content: string
  type?: 'marker'
}

interface DevServerEntry {
  status: DevServerStatus | null
  logs: LogChunk[]
  config: DevServerConfig | null
}

const MAX_LOG_CHUNKS = 2000
// A chunk is a raw WS payload, not a line: a stack trace or a sourcemap dump
// can be megabytes on its own, so a count-only cap bounds nothing in memory.
const MAX_LOG_BYTES = 2 * 1024 * 1024
// Entries are keyed by workdir and were never pruned, so every project ever
// visited kept its full buffer alive for the tab's lifetime.
const MAX_TRACKED_WORKDIRS = 5

const capLogs = (logs: LogChunk[]): LogChunk[] => {
  const capped = logs.length > MAX_LOG_CHUNKS ? logs.slice(-MAX_LOG_CHUNKS) : logs
  let bytes = 0
  let firstKept = capped.length
  // Walk back from the newest chunk, keeping as much recent output as fits.
  for (let i = capped.length - 1; i >= 0; i--) {
    bytes += capped[i]!.content.length
    if (bytes > MAX_LOG_BYTES) break
    firstKept = i
  }
  return firstKept === 0 ? capped : capped.slice(firstKept)
}

/** Drop the least-recently-updated workdir entries so byWorkdir cannot grow with every project visited. */
const capWorkdirs = (byWorkdir: Record<string, DevServerEntry>, keep: string): Record<string, DevServerEntry> => {
  const keys = Object.keys(byWorkdir)
  if (keys.length <= MAX_TRACKED_WORKDIRS) return byWorkdir
  // Object key order is insertion order; upsertEntry re-inserts the touched
  // workdir last, so the oldest-touched keys sit at the front.
  const evictable = keys.filter((key) => key !== keep)
  const next = { ...byWorkdir }
  for (const key of evictable.slice(0, keys.length - MAX_TRACKED_WORKDIRS)) {
    delete next[key]
  }
  return next
}

interface DevServerStore {
  byWorkdir: Record<string, DevServerEntry>

  fetchStatus: (workdir: string) => Promise<void>
  fetchConfig: (workdir: string) => Promise<void>
  fetchLogs: (workdir: string) => Promise<void>
  clearLogs: (workdir: string) => Promise<void>
  insertMarker: (workdir: string) => Promise<void>
  start: (workdir: string) => Promise<void>
  stop: (workdir: string) => Promise<void>
  restart: (workdir: string) => Promise<void>
  saveConfig: (workdir: string, config: DevServerConfig) => Promise<void>
  handleMessage: (message: ServerMessage) => void
}

const EMPTY_ENTRY: DevServerEntry = { status: null, logs: [], config: null }

let logBuffer: { workdir: string; stream: 'stdout' | 'stderr'; content: string }[] = []

const upsertEntry = (
  byWorkdir: Record<string, DevServerEntry>,
  workdir: string,
  updater: (entry: DevServerEntry) => DevServerEntry,
): Record<string, DevServerEntry> => {
  // Re-insert the touched workdir last so key order tracks recency, which is
  // what lets capWorkdirs evict the least-recently-used entries.
  const { [workdir]: existing, ...rest } = byWorkdir
  return capWorkdirs({ ...rest, [workdir]: updater(existing ?? EMPTY_ENTRY) }, workdir)
}

export const useDevServerStore = create<DevServerStore>()((set, get) => {
  function flushLogBuffer() {
    if (logBuffer.length === 0) return
    const chunks = logBuffer
    logBuffer = []
    set((state) => {
      let byWorkdir = state.byWorkdir
      const grouped = new Map<string, LogChunk[]>()
      for (const chunk of chunks) {
        const list = grouped.get(chunk.workdir) ?? []
        list.push({ stream: chunk.stream, content: chunk.content })
        grouped.set(chunk.workdir, list)
      }
      for (const [workdir, newLogs] of grouped) {
        byWorkdir = upsertEntry(byWorkdir, workdir, (entry) => ({
          ...entry,
          logs: capLogs([...entry.logs, ...newLogs]),
        }))
      }
      return { byWorkdir }
    })
  }

  const scheduleLogFlush = createLogBuffer(flushLogBuffer)

  const devServerUrl = (workdir: string, path: string): string =>
    `/api/dev-server/${path}?workdir=${encodeURIComponent(workdir)}`

  /** Run a dev-server request and fold the JSON response into the workdir's entry. */
  const run = async (
    workdir: string,
    url: string,
    init: RequestInit | undefined,
    apply: (data: unknown) => (entry: DevServerEntry) => DevServerEntry,
  ): Promise<void> => {
    if (!workdir) return
    try {
      const res = await authFetch(url, init)
      const data = await res.json()
      set((state) => ({ byWorkdir: upsertEntry(state.byWorkdir, workdir, apply(data)) }))
    } catch {
      // ignore
    }
  }

  const patchStatus =
    (data: unknown) =>
    (entry: DevServerEntry): DevServerEntry => ({
      ...entry,
      status: data as DevServerStatus,
    })

  const patchStatusWithLogsCleared =
    (data: unknown) =>
    (entry: DevServerEntry): DevServerEntry => ({
      ...entry,
      status: data as DevServerStatus,
      logs: [],
    })

  return {
    byWorkdir: {},

    fetchStatus: (workdir) => run(workdir, devServerUrl(workdir, ''), undefined, patchStatus),

    fetchConfig: (workdir) =>
      run(workdir, devServerUrl(workdir, 'config'), undefined, (data) => (entry) => ({
        ...entry,
        config: (data as { config: DevServerConfig | null }).config ?? null,
      })),

    fetchLogs: (workdir) =>
      run(workdir, devServerUrl(workdir, 'logs'), undefined, (data) => (entry) => ({
        ...entry,
        logs: capLogs(
          (data as { logs: { stream: 'stdout' | 'stderr'; content: string; type?: 'marker' }[] }).logs.map((log) => ({
            stream: log.stream,
            content: log.content,
            ...(log.type ? { type: log.type } : {}),
          })),
        ),
      })),

    clearLogs: (workdir) =>
      run(workdir, devServerUrl(workdir, 'clear-logs'), { method: 'POST' }, () => (entry) => ({
        ...entry,
        logs: [],
      })),

    insertMarker: async (workdir) => {
      if (!workdir) return
      try {
        await authFetch(devServerUrl(workdir, 'insert-marker'), { method: 'POST' })
        get().fetchLogs(workdir)
      } catch {
        // ignore
      }
    },

    start: (workdir) => run(workdir, devServerUrl(workdir, 'start'), { method: 'POST' }, patchStatusWithLogsCleared),

    stop: (workdir) => run(workdir, devServerUrl(workdir, 'stop'), { method: 'POST' }, patchStatus),

    restart: (workdir) =>
      run(workdir, devServerUrl(workdir, 'restart'), { method: 'POST' }, patchStatusWithLogsCleared),

    saveConfig: (workdir, config) => {
      if (!workdir) return Promise.resolve()
      return run(
        workdir,
        devServerUrl(workdir, 'config'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        },
        (data) => (entry) => ({
          ...entry,
          config: (data as { config: DevServerConfig | null }).config ?? config,
        }),
      ).then(() => get().fetchStatus(workdir))
    },

    handleMessage: (message) => {
      switch (message.type) {
        case 'devServer.output': {
          const payload = message.payload as DevServerOutputPayload
          logBuffer.push({ workdir: payload.workdir, stream: payload.stream, content: payload.content })
          scheduleLogFlush()
          break
        }
        case 'devServer.state': {
          const payload = message.payload as DevServerStatePayload
          set((state) => ({
            byWorkdir: upsertEntry(state.byWorkdir, payload.workdir, (entry) => {
              const nextStatus = entry.status
                ? {
                    ...entry.status,
                    state: payload.state as DevServerState,
                    errorMessage: payload.errorMessage,
                    ...(payload.url !== undefined ? { url: payload.url } : {}),
                    ...(payload.inspectProxyPort !== undefined ? { inspectProxyPort: payload.inspectProxyPort } : {}),
                  }
                : {
                    state: payload.state as DevServerState,
                    url: payload.url ?? null,
                    hotReload: false,
                    config: null,
                    errorMessage: payload.errorMessage,
                    inspectProxyPort: payload.inspectProxyPort ?? null,
                  }
              return { ...entry, status: nextStatus }
            }),
          }))
          break
        }
      }
    },
  }
})

/** Subscribe to the dev server entry for a single workdir (stable default when absent). */
export function useDevServerEntry(workdir: string | null | undefined): DevServerEntry {
  return useDevServerStore((state) => (workdir ? state.byWorkdir[workdir] : undefined) ?? EMPTY_ENTRY)
}
