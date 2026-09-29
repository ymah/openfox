import { useMemo } from 'react'
import { usePlugins } from './usePlugins'
import { PROJECT_MODES, type ProjectModeDef } from '../lib/project-modes'
import { pluginIdForProjectMode } from '../lib/bundled-plugin-modes'

/**
 * Project functions that can actually be used right now: the core modes plus
 * those whose owning plugin is enabled. The registry itself is fixed at build
 * time, so without this filter a disabled plugin's tab and creation choice
 * would stay visible, and creating such a project would be refused by the
 * server. While the plugin list is loading (or failed to load) every mode is
 * offered rather than hiding things on a guess.
 */
export function useProjectModes(): ProjectModeDef[] {
  const { plugins, loading, error } = usePlugins()
  return useMemo(() => {
    if ((loading && plugins.length === 0) || error) return PROJECT_MODES
    return PROJECT_MODES.filter((mode) => {
      const pluginId = pluginIdForProjectMode(mode.value)
      return !pluginId || plugins.some((p) => p.id === pluginId && p.enabled)
    })
  }, [plugins, loading, error])
}
