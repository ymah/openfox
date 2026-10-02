import type { ReactElement } from 'react'
import type { Translation } from '@shared/i18n/index.js'
import { pluginIdForProjectMode } from './bundled-plugin-modes'

/**
 * Application pages contributed by bundled first-party plugins.
 *
 * Why this is a build-time registry rather than a runtime one: a plugin page is a
 * real React component that uses the host's components, hooks and theme. The
 * declarative panel contract (src/shared/plugin.ts) is a closed set of widgets
 * with no multi-line editor and no route, and loading a plugin's own compiled
 * bundle at runtime would mean sharing React across a module boundary. Bundled
 * plugins ship inside this repo, so their pages are simply compiled into the web
 * bundle — which is what `import.meta.glob` does below.
 *
 * The trade-off, stated plainly: only bundled plugins can own pages. A plugin the
 * user installs at runtime cannot, and would need the runtime-loading machinery
 * this deliberately avoids.
 *
 * Project modes live in bundled-plugin-modes.ts instead, so that importing the
 * list of project functions does not pull React in.
 */
export interface BundledPluginPage {
  /** wouter path pattern, e.g. '/p/:projectId/codex'. */
  path: string
  render: (projectId: string) => ReactElement
}

export interface BundledPluginNavItem {
  /** wouter path pattern of a page this plugin owns, e.g. '/p/:projectId/codex'. */
  path: string
  label: Translation
}

export interface BundledPluginUi {
  /** Must match the plugin's package name, so the host can check it is enabled. */
  pluginId: string
  pages?: BundledPluginPage[]
  /** Links shown in the project sidebar, so the plugin's pages are reachable from anywhere in the project. */
  nav?: BundledPluginNavItem[]
  /** Replaces the default project home for projects of this plugin's mode. */
  projectHome?: (projectId: string) => ReactElement
}

// Eager so the pages land in the main bundle: they are first-party code, and a
// lazy boundary here would be the app's only one, for no benefit.
const modules = import.meta.glob<{ default: BundledPluginUi }>('@bundled/*/web/index.tsx', {
  eager: true,
})

export const BUNDLED_PLUGIN_UI: BundledPluginUi[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter((ui): ui is BundledPluginUi => Boolean(ui?.pluginId))

export const BUNDLED_PLUGIN_PAGES: (BundledPluginPage & { pluginId: string })[] = BUNDLED_PLUGIN_UI.flatMap((ui) =>
  (ui.pages ?? []).map((page) => ({ ...page, pluginId: ui.pluginId })),
)

export function projectHomeForMode(type: string | undefined): ((projectId: string) => ReactElement) | undefined {
  const pluginId = pluginIdForProjectMode(type)
  if (!pluginId) return undefined
  return BUNDLED_PLUGIN_UI.find((ui) => ui.pluginId === pluginId)?.projectHome
}

/** The sidebar links of the plugin that owns a project's mode, with the project id filled in. */
export function navItemsForMode(type: string | undefined, projectId: string): { href: string; label: Translation }[] {
  const pluginId = pluginIdForProjectMode(type)
  if (!pluginId) return []
  const ui = BUNDLED_PLUGIN_UI.find((entry) => entry.pluginId === pluginId)
  return (ui?.nav ?? []).map((item) => ({ href: item.path.replace(':projectId', projectId), label: item.label }))
}

export { pluginIdForProjectMode }
