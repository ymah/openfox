import { describe, it, expect } from 'vitest'
import {
  groupByCategory,
  hasMultipleCategories,
  filterByProjectType,
  agentsForWorkflow,
  groupBuiltInsByFunction,
} from './category-groups'

interface Item {
  id: string
  category?: string
}

describe('groupByCategory', () => {
  it('orders known categories first, in the given order, then others alphabetically, then uncategorized last', () => {
    const items: Item[] = [
      { id: 'z-custom', category: 'zeta' },
      { id: 'gtd-1', category: 'gtd' },
      { id: 'legacy', category: undefined },
      { id: 'dev-1', category: 'dev' },
      { id: 'a-custom', category: 'alpha' },
    ]

    const groups = groupByCategory(items)

    expect(groups.map((g) => g.category)).toEqual(['dev', 'gtd', 'alpha', 'zeta', null])
    expect(groups.find((g) => g.category === 'dev')?.items).toEqual([{ id: 'dev-1', category: 'dev' }])
    expect(groups.find((g) => g.category === null)?.items).toEqual([{ id: 'legacy', category: undefined }])
  })

  it('keeps items within a category in their original relative order', () => {
    const items: Item[] = [
      { id: 'gtd-b', category: 'gtd' },
      { id: 'gtd-a', category: 'gtd' },
    ]

    const groups = groupByCategory(items)

    expect(groups[0]!.items.map((i) => i.id)).toEqual(['gtd-b', 'gtd-a'])
  })

  it('treats an empty-string category the same as no category', () => {
    const items: Item[] = [{ id: 'x', category: '' }]

    const groups = groupByCategory(items)

    expect(groups).toEqual([{ category: null, items: [{ id: 'x', category: '' }] }])
  })
})

describe('hasMultipleCategories', () => {
  it('is false when every item shares the same category', () => {
    expect(
      hasMultipleCategories<Item>([
        { id: 'a', category: 'dev' },
        { id: 'b', category: 'dev' },
      ]),
    ).toBe(false)
  })

  it('is false when nothing is categorized at all (pure-dev project, pre-existing behavior)', () => {
    expect(hasMultipleCategories<Item>([{ id: 'a' }, { id: 'b' }])).toBe(false)
  })

  it('is true when at least two distinct categories are present', () => {
    expect(
      hasMultipleCategories<Item>([
        { id: 'a', category: 'dev' },
        { id: 'b', category: 'gtd' },
      ]),
    ).toBe(true)
  })

  it('is true when one item is categorized and another is not', () => {
    expect(hasMultipleCategories<Item>([{ id: 'a', category: 'gtd' }, { id: 'b' }])).toBe(true)
  })
})

describe('filterByProjectType', () => {
  const items: Item[] = [
    { id: 'builder', category: 'dev' },
    { id: 'gtd-secretary', category: 'gtd' },
    { id: 'custom-legacy' },
  ]

  it('keeps only items matching the project type, plus uncategorized items', () => {
    expect(filterByProjectType(items, 'dev').map((i) => i.id)).toEqual(['builder', 'custom-legacy'])
    expect(filterByProjectType(items, 'gtd').map((i) => i.id)).toEqual(['gtd-secretary', 'custom-legacy'])
  })

  it('returns everything unfiltered when the project type is unknown/not yet loaded', () => {
    expect(filterByProjectType(items, undefined)).toEqual(items)
  })

  it('isolates a third project type (writing) from both dev and gtd items', () => {
    const threeWay: Item[] = [
      { id: 'builder', category: 'dev' },
      { id: 'gtd-secretary', category: 'gtd' },
      { id: 'writing-secretary', category: 'writing' },
      { id: 'custom-legacy' },
    ]
    expect(filterByProjectType(threeWay, 'writing').map((i) => i.id)).toEqual(['writing-secretary', 'custom-legacy'])
  })
})

describe('groupByCategory default order', () => {
  it('orders every known project type before unknown categories', () => {
    const items = [
      { id: 'zzz-custom', category: 'zzz-custom' },
      { id: 'writing-secretary', category: 'writing' },
      { id: 'gtd-secretary', category: 'gtd' },
      { id: 'builder', category: 'dev' },
      { id: 'legacy' },
    ]

    const categories = groupByCategory(items).map((g) => g.category)

    // Regression: the default order was the literal ['dev', 'gtd'], so 'writing'
    // fell through to the alphabetical "unknown" bucket and sorted after
    // 'zzz-custom'. It is now derived from PROJECT_TYPES.
    expect(categories).toEqual(['dev', 'gtd', 'writing', 'zzz-custom', null])
  })
})

describe('agentsForWorkflow', () => {
  const agents = [
    { id: 'planner', category: 'dev' },
    { id: 'custom' },
    { id: 'chat-assistant', category: 'chat' },
    { id: 'gtd-secretary', category: 'gtd' },
  ]
  const ids = (list: { id: string }[]) => list.map((a) => a.id)

  it('offers a dev workflow only dev and uncategorised agents', () => {
    expect(ids(agentsForWorkflow(agents, undefined))).toEqual(['planner', 'custom'])
    expect(ids(agentsForWorkflow(agents, ''))).toEqual(['planner', 'custom'])
    expect(ids(agentsForWorkflow(agents, 'dev'))).toEqual(['planner', 'custom'])
  })

  it('offers a chat workflow the chat assistants, not the dev agents', () => {
    expect(ids(agentsForWorkflow(agents, 'chat'))).toEqual(['custom', 'chat-assistant'])
    expect(ids(agentsForWorkflow(agents, 'gtd'))).toEqual(['custom', 'gtd-secretary'])
  })

  it('keeps an agent a step already uses, so an existing workflow still resolves', () => {
    expect(ids(agentsForWorkflow(agents, 'chat', ['planner', undefined]))).toEqual([
      'planner',
      'custom',
      'chat-assistant',
    ])
  })
})

describe('groupBuiltInsByFunction', () => {
  it('puts the classic dev set first, then each project function, keeping item order inside a group', () => {
    const items = [
      { id: 'chat-a', category: 'chat' },
      { id: 'default' },
      { id: 'gtd-a', category: 'gtd' },
      { id: 'chat-b', category: 'chat' },
      { id: 'planner', category: 'dev' },
    ]
    const groups = groupBuiltInsByFunction(items)
    expect(groups.map((g) => g.category)).toEqual(['dev', 'chat', 'gtd'])
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([
      ['default', 'planner'],
      ['chat-a', 'chat-b'],
      ['gtd-a'],
    ])
  })

  it('is empty for nothing', () => {
    expect(groupBuiltInsByFunction([])).toEqual([])
  })
})
