import { describe, it, expect } from 'vitest'
import { groupByCategory, hasMultipleCategories, filterByProjectType } from './category-groups'

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
})
