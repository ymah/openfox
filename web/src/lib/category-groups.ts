import type { ProjectType } from '@shared/types.js'
import { PROJECT_MODES } from './project-modes'

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
  // Derived from the project-mode registry (core modes plus the ones bundled
  // plugins declare): the literal list used to be ['dev', 'gtd'], so 'writing'
  // was silently demoted to the "unknown category" bucket.
  order: string[] = PROJECT_MODES.map((mode) => mode.value),
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

/**
 * Scope a flat agent/workflow list to a project's function: keep items whose
 * `category` matches the project's `type`, plus uncategorized items (custom
 * user/project agents predating this field) which stay visible everywhere.
 * This is what actually isolates dev vs GTD — `groupByCategory` above only
 * ever labels a flat list, it never hides anything.
 */
export function filterByProjectType<T extends { category?: string }>(
  items: T[],
  projectType: ProjectType | undefined,
): T[] {
  if (!projectType) return items
  return items.filter((item) => {
    const category = item.category?.trim()
    return !category || category === projectType
  })
}

/**
 * The agents a workflow's steps may pick: those of the workflow's own project
 * function (a chat workflow gets the chat assistants, a dev workflow the dev agents,
 * never the other way round) plus uncategorised ones. An empty category means a
 * classic dev workflow. Agents a step already uses are kept so an existing workflow
 * keeps resolving, whatever its history.
 */
export function agentsForWorkflow<T extends { id: string; category?: string }>(
  agents: T[],
  workflowCategory: string | undefined,
  alreadyUsedIds: Iterable<string | undefined> = [],
): T[] {
  const used = new Set(alreadyUsedIds)
  const scoped = new Set(filterByProjectType(agents, workflowCategory || 'dev'))
  return agents.filter((agent) => scoped.has(agent) || used.has(agent.id))
}
