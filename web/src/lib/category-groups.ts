/**
 * Groups items with an optional `category` string for display in a flat
 * selector list — used by AgentSelector and the MoreMenu workflows tab to
 * separate GTD from classic dev agents/workflows without hiding custom
 * items that have no category at all.
 */

export interface CategoryGroup<T> {
  category: string | null
  items: T[]
}

/** Known categories come first, in `order`; any other category follows
 * alphabetically; uncategorized items (no `category`, e.g. custom
 * user/project agents predating this field) come last, ungrouped. */
export function groupByCategory<T extends { category?: string }>(
  items: T[],
  order: string[] = ['dev', 'gtd'],
): CategoryGroup<T>[] {
  const buckets = new Map<string | null, T[]>()
  for (const item of items) {
    const key = item.category?.trim() || null
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }

  const known = order.filter((c) => buckets.has(c)).map((c) => ({ category: c, items: buckets.get(c)! }))
  const otherKeys = [...buckets.keys()].filter((k): k is string => k !== null && !order.includes(k)).sort()
  const other = otherKeys.map((c) => ({ category: c, items: buckets.get(c)! }))
  const uncategorized = buckets.has(null) ? [{ category: null, items: buckets.get(null)! }] : []

  return [...known, ...other, ...uncategorized]
}

/** Whether items span more than one distinct category — the signal to show
 * section headers at all, so a project with only uncategorized/dev items
 * looks exactly as it did before this field existed. */
export function hasMultipleCategories<T extends { category?: string }>(items: T[]): boolean {
  return new Set(items.map((i) => i.category?.trim() || '')).size > 1
}
