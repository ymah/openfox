// Cross-conversation memory for the chat assistants: a small list of facts the
// user's assistants have chosen to remember (or the user added by hand), shared
// by every chat project. Stored as one JSON value in the plugin's key-value
// storage, bounded so it can never grow without limit.
//
// There is no embedding model and no hidden injection: an assistant reads memory
// by calling `memory_search`, writes it with `memory_save`, and everything it
// holds is listed, editable and deletable on the Memory page. Search is plain
// keyword scoring (TF-IDF over accent-folded tokens, with prefix matching so
// "voyage" finds "voyages"), which is enough for a list of short facts.

import { randomUUID } from 'node:crypto'

const STORAGE_KEY = 'memory.v1'
const ENABLED_KEY = 'memory.enabled'

export const MAX_ENTRIES = 500
export const MAX_TEXT_LENGTH = 1000
export const MAX_TAGS = 8
const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20
/** Above this token overlap, a "new" fact is treated as a rewording of an existing one. */
const NEAR_DUPLICATE = 0.8

const STOPWORDS = new Set(
  (
    'a an and are as at be by for from has have i in is it its of on or that the this to was were will with you your ' +
    'au aux ce ces dans de des du elle en est et il je la le les leur mais me mon ne nous on ou par pas pour que qui ' +
    'sa se ses son sur te ton tu un une vous'
  ).split(' '),
)

class MemoryError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const invalid = (message) => new MemoryError('invalid_request', message)
const notFound = () => new MemoryError('not_found', 'Memory not found')

/** Lowercase, accent-folded word tokens. */
export function tokenize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
}

const contentTokens = (text) => tokenize(text).filter((token) => !STOPWORDS.has(token))

function cleanText(text) {
  if (typeof text !== 'string' || !text.trim()) throw invalid('text is required')
  const value = text.trim().replace(/\s+/g, ' ')
  if (value.length > MAX_TEXT_LENGTH) throw invalid(`A memory is limited to ${MAX_TEXT_LENGTH} characters`)
  return value
}

function cleanTags(tags) {
  if (tags === undefined || tags === null) return []
  if (!Array.isArray(tags)) throw invalid('tags must be a list')
  return [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS)
}

function jaccard(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const token of setA) if (setB.has(token)) shared++
  return shared / (setA.size + setB.size - shared)
}

/**
 * Does a document token match a query token? Exact, or a light stem match: the
 * query is a prefix of the word ("voyage" finds "voyages"), or the word is a
 * prefix of the query by at most a short suffix ("trips" finds "trip").
 */
const matches = (docToken, queryToken) =>
  docToken === queryToken ||
  (queryToken.length >= 4 && docToken.startsWith(queryToken)) ||
  (docToken.length >= 4 && queryToken.startsWith(docToken) && queryToken.length - docToken.length <= 3)

function scoreAll(entries, query) {
  const queryTokens = [...new Set(contentTokens(query))]
  if (queryTokens.length === 0) return []
  const docs = entries.map((entry) => ({
    entry,
    tokens: contentTokens(entry.text),
    tags: entry.tags.flatMap((tag) => tokenize(tag)),
  }))
  return docs
    .map((doc) => {
      let score = 0
      for (const q of queryTokens) {
        const df = docs.filter((d) => d.tokens.some((t) => matches(t, q)) || d.tags.some((t) => matches(t, q))).length
        const idf = Math.log(1 + docs.length / (1 + df))
        const tf = doc.tokens.filter((t) => matches(t, q)).length
        if (tf > 0) score += idf * (1 + Math.log(tf))
        if (doc.tags.some((t) => matches(t, q))) score += 2 * idf
      }
      return { entry: doc.entry, score }
    })
    .filter((result) => result.score > 0)
}

/**
 * @param {{ get(key: string): unknown, set(key: string, value: unknown): void }} storage
 * @param {{ now?: () => Date, id?: () => string }} [options]
 */
export function createMemoryStore(storage, options = {}) {
  const now = options.now ?? (() => new Date())
  const newId = options.id ?? (() => randomUUID().slice(0, 8))

  const read = () => {
    const raw = storage.get(STORAGE_KEY)
    if (typeof raw !== 'string') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string')
        : []
    } catch {
      return []
    }
  }
  const write = (entries) => storage.set(STORAGE_KEY, JSON.stringify(entries))
  const byRecency = (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)

  return {
    isEnabled() {
      return storage.get(ENABLED_KEY) !== false
    },
    setEnabled(enabled) {
      storage.set(ENABLED_KEY, Boolean(enabled))
    },

    list() {
      return read().sort(byRecency)
    },

    /** Add a fact, or refresh an existing one it repeats or rewords. */
    save({ text, tags } = {}) {
      const value = cleanText(text)
      const cleanedTags = cleanTags(tags)
      const entries = read()
      const tokens = contentTokens(value)
      const stamp = now().toISOString()

      const similar = entries.find((e) => e.text.toLowerCase() === value.toLowerCase())
      const reworded = similar ?? entries.find((e) => jaccard(contentTokens(e.text), tokens) >= NEAR_DUPLICATE)
      if (reworded) {
        reworded.text = value
        reworded.tags = [...new Set([...reworded.tags, ...cleanedTags])].slice(0, MAX_TAGS)
        reworded.updatedAt = stamp
        write(entries)
        return { action: 'updated', entry: reworded }
      }

      if (entries.length >= MAX_ENTRIES) {
        throw invalid(`Memory is full (${MAX_ENTRIES} entries): forget something before saving more`)
      }
      const entry = { id: newId(), text: value, tags: cleanedTags, createdAt: stamp, updatedAt: stamp }
      write([...entries, entry])
      return { action: 'created', entry }
    },

    /** Most relevant memories for a query; with no query, the most recent ones. */
    search(query, limit) {
      const cap = Math.min(Math.max(Number.isInteger(limit) ? limit : DEFAULT_LIMIT, 1), MAX_LIMIT)
      const entries = read()
      if (typeof query !== 'string' || !query.trim()) return entries.sort(byRecency).slice(0, cap)
      return scoreAll(entries, query)
        .sort((a, b) => b.score - a.score || byRecency(a.entry, b.entry))
        .slice(0, cap)
        .map((result) => result.entry)
    },

    update(id, { text, tags }) {
      const entries = read()
      const entry = entries.find((e) => e.id === id)
      if (!entry) throw notFound()
      if (text !== undefined) entry.text = cleanText(text)
      if (tags !== undefined) entry.tags = cleanTags(tags)
      entry.updatedAt = now().toISOString()
      write(entries)
      return entry
    },

    forget(id) {
      const entries = read()
      if (!entries.some((e) => e.id === id)) throw notFound()
      write(entries.filter((e) => e.id !== id))
    },

    clear() {
      write([])
    },
  }
}

const formatEntry = (e) =>
  `[${e.id}] ${e.updatedAt.slice(0, 10)} — ${e.text}${e.tags.length ? ` #${e.tags.join(' #')}` : ''}`

const OFF_MESSAGE = 'Memory is turned off by the user.'

/** The three tools the assistants use. Return values follow the plugin tool contract. */
export function registerMemoryTools(registry, store) {
  registry.registerTool({
    name: 'memory_search',
    description:
      'Look up what you remember about the user from earlier conversations (preferences, projects, people, facts they told you). ' +
      'With a query, returns the most relevant memories; with no query, the most recent ones. Call it at the start of a conversation ' +
      'and whenever a request depends on personal context. Search with short keywords in the language the memory was likely written in, ' +
      'and if a query finds nothing, retry once with no query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to look for. Omit to list the most recent memories.' },
        limit: { type: 'integer', description: `How many to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
      },
    },
    async execute(args) {
      if (!store.isEnabled()) return { success: true, output: `${OFF_MESSAGE} Nothing is remembered.` }
      const found = store.search(args.query, args.limit)
      return {
        success: true,
        output: found.length ? found.map(formatEntry).join('\n') : 'No matching memories.',
      }
    },
  })

  registry.registerTool({
    name: 'memory_save',
    description:
      'Remember a durable fact about the user for future conversations: a stable preference, their situation, ongoing projects, ' +
      'people, recurring constraints. One short self-contained sentence per memory, written so it makes sense on its own. ' +
      'Never save secrets, passwords, health or financial details, or anything the user asked you not to keep. ' +
      'Saving something that is already remembered updates it instead of duplicating it. Tell the user when you save something.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The fact, as one short standalone sentence.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional short topic tags.' },
      },
      required: ['text'],
    },
    async execute(args) {
      if (!store.isEnabled()) return { success: false, error: `${OFF_MESSAGE} Do not save anything.` }
      try {
        const { action, entry } = store.save({ text: args.text, tags: args.tags })
        return { success: true, output: `${action === 'created' ? 'Saved' : 'Updated'}: ${formatEntry(entry)}` }
      } catch (error) {
        return { success: false, error: error.message }
      }
    },
  })

  registry.registerTool({
    name: 'memory_forget',
    description:
      'Delete one memory by its id (as returned by memory_search). Use it when the user asks you to forget something or a memory is wrong.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The memory id.' } },
      required: ['id'],
    },
    async execute(args) {
      try {
        store.forget(String(args.id))
        return { success: true, output: `Forgotten: ${args.id}` }
      } catch (error) {
        return { success: false, error: error.message }
      }
    },
  })
}

/** The Memory page's methods. The RPC transport turns a throw into a 400 and carries `code`. */
export function registerMemoryRpc(registry, store) {
  registry.registerRpc('memory.list', async () => ({ entries: store.list(), enabled: store.isEnabled() }))
  registry.registerRpc('memory.add', async (params) => ({
    entry: store.save({ text: params.text, tags: params.tags }).entry,
  }))
  registry.registerRpc('memory.update', async (params) => ({
    entry: store.update(String(params.id), { text: params.text, tags: params.tags }),
  }))
  registry.registerRpc('memory.forget', async (params) => {
    store.forget(String(params.id))
    return { ok: true }
  })
  registry.registerRpc('memory.clear', async () => {
    store.clear()
    return { ok: true }
  })
  registry.registerRpc('memory.setEnabled', async (params) => {
    store.setEnabled(params.enabled === true)
    return { enabled: store.isEnabled() }
  })
}
