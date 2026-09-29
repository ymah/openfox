export const MAX_ENTRIES: number
export const MAX_TEXT_LENGTH: number
export const MAX_TAGS: number

export interface MemoryEntry {
  id: string
  text: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface MemoryStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface MemoryStore {
  isEnabled(): boolean
  setEnabled(enabled: boolean): void
  list(): MemoryEntry[]
  save(input?: { text?: unknown; tags?: unknown }): { action: 'created' | 'updated'; entry: MemoryEntry }
  search(query?: unknown, limit?: unknown): MemoryEntry[]
  update(id: string, input: { text?: unknown; tags?: unknown }): MemoryEntry
  forget(id: string): void
  clear(): void
}

export function tokenize(text: string): string[]
export function createMemoryStore(
  storage: MemoryStorage,
  options?: { now?: () => Date; id?: () => string },
): MemoryStore
export function registerMemoryTools(registry: unknown, store: MemoryStore): void
export function registerMemoryRpc(registry: unknown, store: MemoryStore): void
