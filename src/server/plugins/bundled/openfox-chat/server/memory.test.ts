import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_ENTRIES,
  MAX_TEXT_LENGTH,
  createMemoryStore,
  registerMemoryRpc,
  registerMemoryTools,
  tokenize,
} from './memory.js'
import type { MemoryStore } from './memory.js'

type Store = MemoryStore

function makeStorage() {
  const data = new Map<string, unknown>()
  return {
    get: (key: string) => data.get(key),
    set: (key: string, value: unknown) => void data.set(key, value),
  }
}

let tick = 0
function makeStore(storage = makeStorage()) {
  let n = 0
  return createMemoryStore(storage, {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    id: () => `m${++n}`,
  })
}

describe('tokenize', () => {
  it('folds case and accents and drops punctuation and single letters', () => {
    expect(tokenize('Élève: à Paris, n°55!')).toEqual(['eleve', 'paris', '55'])
  })
})

describe('memory store', () => {
  let store: Store
  beforeEach(() => {
    tick = 0
    store = makeStore()
  })

  it('saves, lists newest first, and normalises text and tags', () => {
    store.save({ text: '  Lives   in Lyon ', tags: ['Home', 'home', ' City '] })
    store.save({ text: 'Prefers metric units' })
    const all = store.list()
    expect(all.map((e) => e.text)).toEqual(['Prefers metric units', 'Lives in Lyon'])
    expect(all[1]!.tags).toEqual(['home', 'city'])
  })

  it('refreshes instead of duplicating an identical or reworded fact, keeping the id', () => {
    const first = store.save({ text: 'The user works as a nurse at the Lyon hospital', tags: ['job'] })
    const same = store.save({ text: 'the user works as a nurse at the lyon hospital' })
    const reworded = store.save({ text: 'The user works as a nurse at the Lyon hospital now', tags: ['work'] })
    expect(first.action).toBe('created')
    expect(same.action).toBe('updated')
    expect(reworded.action).toBe('updated')
    expect(store.list()).toHaveLength(1)
    expect(reworded.entry.id).toBe(first.entry.id)
    expect(reworded.entry.tags).toEqual(['job', 'work'])
  })

  it('does not merge different facts that share a few words', () => {
    store.save({ text: 'The user likes green tea' })
    store.save({ text: 'The user likes hiking in the Alps' })
    expect(store.list()).toHaveLength(2)
  })

  it('rejects empty, oversized and malformed input', () => {
    expect(() => store.save({ text: '   ' })).toThrow(/text is required/)
    expect(() => store.save({ text: 42 })).toThrow(/text is required/)
    expect(() => store.save({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })).toThrow(/limited/)
    expect(() => store.save({ text: 'ok', tags: 'nope' })).toThrow(/tags/)
  })

  it('refuses to grow past the cap, and says why', () => {
    const storage = makeStorage()
    storage.set(
      'memory.v1',
      JSON.stringify(
        Array.from({ length: MAX_ENTRIES }, (_, i) => ({
          id: `e${i}`,
          text: `unique fact number ${i} about topic${i}`,
          tags: [],
          createdAt: 'x',
          updatedAt: 'x',
        })),
      ),
    )
    const full = makeStore(storage)
    expect(() => full.save({ text: 'a completely different new thing zebra' })).toThrow(/full/)
  })

  it('finds by keywords, ranks the rarer match first, and matches plurals and accents', () => {
    store.save({ text: 'Planning a trip to Japan in spring', tags: ['travel'] })
    store.save({ text: 'Allergic to peanuts' })
    store.save({ text: 'Loves trips by train' })
    expect(store.search('japan').map((e) => e.text)).toEqual(['Planning a trip to Japan in spring'])
    expect(store.search('trips').length).toBe(2) // "trip" and "trips" via prefix matching
    expect(store.search('PEANUT allergie').map((e) => e.text)).toEqual(['Allergic to peanuts'])
    expect(store.search('voyage travel').map((e) => e.text)).toEqual(['Planning a trip to Japan in spring']) // tag match
    expect(store.search('quantum physics')).toEqual([])
  })

  it('with no query returns the most recent, honouring the limit', () => {
    for (let i = 0; i < 12; i++) store.save({ text: `distinct fact ${i} ${'abcdefghijkl'[i]}${'mnopqrstuvwx'[i]}zz` })
    expect(store.search().length).toBe(8)
    expect(store.search('', 3).length).toBe(3)
    expect(store.search(undefined, 999).length).toBe(12)
    expect(store.search()[0]!.text).toContain('fact 11')
  })

  it('updates and forgets by id, and reports unknown ids', () => {
    const { entry } = store.save({ text: 'Old text' })
    expect(store.update(entry.id, { text: 'New text', tags: ['x'] })).toMatchObject({ text: 'New text', tags: ['x'] })
    expect(() => store.update('nope', { text: 'x' })).toThrow(/not found/)
    store.forget(entry.id)
    expect(store.list()).toEqual([])
    expect(() => store.forget(entry.id)).toThrow(/not found/)
  })

  it('clear empties it, and the on/off switch defaults to on', () => {
    store.save({ text: 'something to clear' })
    store.clear()
    expect(store.list()).toEqual([])
    expect(store.isEnabled()).toBe(true)
    store.setEnabled(false)
    expect(store.isEnabled()).toBe(false)
  })

  it('survives corrupt stored data', () => {
    const storage = makeStorage()
    storage.set('memory.v1', '{not json')
    expect(makeStore(storage).list()).toEqual([])
    storage.set('memory.v1', JSON.stringify([{ nope: 1 }, { id: 'a', text: 'valid', tags: [], updatedAt: 'x' }]))
    expect(
      makeStore(storage)
        .list()
        .map((e) => e.id),
    ).toEqual(['a'])
  })
})

describe('memory tools and RPC', () => {
  type Tool = {
    name: string
    execute(args: Record<string, unknown>): Promise<{ success: boolean; output?: string; error?: string }>
  }
  function setup() {
    tick = 0
    const store = makeStore()
    const tools = new Map<string, Tool>()
    const rpc = new Map<string, (params: Record<string, unknown>) => Promise<any>>()
    const registry = {
      registerTool: (t: Tool) => tools.set(t.name, t),
      registerRpc: (name: string, h: (p: Record<string, unknown>) => Promise<any>) => rpc.set(name, h),
    }
    registerMemoryTools(registry, store)
    registerMemoryRpc(registry, store)
    return { store, tools, rpc }
  }

  it('registers exactly the three tools and the page methods', () => {
    const { tools, rpc } = setup()
    expect([...tools.keys()].sort()).toEqual(['memory_forget', 'memory_save', 'memory_search'])
    expect([...rpc.keys()].sort()).toEqual([
      'memory.add',
      'memory.clear',
      'memory.forget',
      'memory.list',
      'memory.setEnabled',
      'memory.update',
    ])
  })

  it('save then search round-trips through the tools with ids the model can forget by', async () => {
    const { tools } = setup()
    const saved = await tools.get('memory_save')!.execute({ text: 'Prefers dark mode', tags: ['ui'] })
    expect(saved).toMatchObject({ success: true })
    expect(saved.output).toMatch(/^Saved: \[m1\]/)

    const found = await tools.get('memory_search')!.execute({ query: 'dark' })
    expect(found.output).toContain('[m1]')
    expect(found.output).toContain('#ui')

    expect(await tools.get('memory_forget')!.execute({ id: 'm1' })).toMatchObject({ success: true })
    expect((await tools.get('memory_search')!.execute({ query: 'dark' })).output).toBe('No matching memories.')
  })

  it('reports errors as failed results instead of throwing', async () => {
    const { tools } = setup()
    expect(await tools.get('memory_save')!.execute({ text: '' })).toMatchObject({ success: false })
    expect(await tools.get('memory_forget')!.execute({ id: 'nope' })).toMatchObject({ success: false })
  })

  it('when turned off, saving is refused and searching returns nothing', async () => {
    const { tools, store } = setup()
    await tools.get('memory_save')!.execute({ text: 'A remembered thing' })
    store.setEnabled(false)
    expect(await tools.get('memory_save')!.execute({ text: 'Another thing entirely' })).toMatchObject({
      success: false,
    })
    const search = await tools.get('memory_search')!.execute({ query: 'remembered' })
    expect(search.success).toBe(true)
    expect(search.output).toMatch(/turned off/)
    expect(store.list()).toHaveLength(1) // nothing was lost, only hidden
  })

  it('the page methods list, edit, forget, clear and toggle', async () => {
    const { rpc } = setup()
    const added = await rpc.get('memory.add')!({ text: 'Added by hand', tags: ['manual'] })
    expect(added.entry.text).toBe('Added by hand')
    expect(await rpc.get('memory.list')!({})).toMatchObject({ enabled: true, entries: [{ text: 'Added by hand' }] })
    expect((await rpc.get('memory.update')!({ id: added.entry.id, text: 'Edited' })).entry.text).toBe('Edited')
    await expect(rpc.get('memory.update')!({ id: 'nope', text: 'x' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(rpc.get('memory.add')!({ text: '' })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(await rpc.get('memory.setEnabled')!({ enabled: false })).toEqual({ enabled: false })
    await rpc.get('memory.forget')!({ id: added.entry.id })
    await rpc.get('memory.clear')!({})
    expect((await rpc.get('memory.list')!({})).entries).toEqual([])
  })
})
