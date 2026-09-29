import type { ProjectModeDef } from './project-modes'

/**
 * Project functions declared by bundled plugins.
 *
 * Deliberately separate from bundled-plugin-ui.ts (which collects their pages):
 * a mode is plain data, so anything may import it — including Node-side unit
 * tests. Globbing the page entries here instead would drag React components, and
 * through them the WebSocket client, into every module that just wants to know
 * which project functions exist.
 */
export interface BundledPluginModes {
  pluginId: string
  modes: ProjectModeDef[]
}

const modules = import.meta.glob<{ default: BundledPluginModes }>('@bundled/*/web/modes.ts', {
  eager: true,
})

export const BUNDLED_PLUGIN_MODES: (ProjectModeDef & { pluginId: string })[] = Object.values(modules)
  .map((mod) => mod.default)
  .filter((entry): entry is BundledPluginModes => Boolean(entry?.pluginId))
  .flatMap((entry) => entry.modes.map((mode) => ({ ...mode, pluginId: entry.pluginId })))

/** The plugin owning a project mode, or undefined for a core mode. */
export function pluginIdForProjectMode(type: string | undefined): string | undefined {
  return BUNDLED_PLUGIN_MODES.find((mode) => mode.value === type)?.pluginId
}
