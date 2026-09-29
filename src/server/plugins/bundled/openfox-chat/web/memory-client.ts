import { invokePluginRpc } from '@/lib/plugin-actions'

/**
 * Typed access to the chat plugin's memory RPC methods. The store itself lives
 * on the server (see ../server/memory.js); the page can only list and edit it.
 */
const PLUGIN_ID = 'openfox-chat'

export interface MemoryEntry {
  id: string
  text: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

function call<T>(method: string, projectId: string, params: Record<string, unknown> = {}): Promise<T> {
  return invokePluginRpc(PLUGIN_ID, method, params, { projectId }) as Promise<T>
}

export const listMemories = (projectId: string) =>
  call<{ entries: MemoryEntry[]; enabled: boolean }>('memory.list', projectId)

export const addMemory = (projectId: string, text: string, tags: string[]) =>
  call<{ entry: MemoryEntry }>('memory.add', projectId, { text, tags })

export const updateMemory = (projectId: string, id: string, text: string, tags: string[]) =>
  call<{ entry: MemoryEntry }>('memory.update', projectId, { id, text, tags })

export const forgetMemory = (projectId: string, id: string) => call<{ ok: true }>('memory.forget', projectId, { id })

export const clearMemories = (projectId: string) => call<{ ok: true }>('memory.clear', projectId)

export const setMemoryEnabled = (projectId: string, enabled: boolean) =>
  call<{ enabled: boolean }>('memory.setEnabled', projectId, { enabled })

/** "a, b ,c" → ['a', 'b', 'c'] */
export function parseTags(input: string): string[] {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}
