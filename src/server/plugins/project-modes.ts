import { CORE_PROJECT_TYPES } from '../../shared/types.js'

/**
 * Project functions declared by enabled plugins, kept next to the core's own
 * list so a project's `type` can be validated at runtime. Mirrors
 * setPluginAgents / setPluginWorkflows: the plugin host pushes the current set
 * from applyContributions(), and it is cleared when a plugin is disabled.
 *
 * The core no longer knows GTD or writing exist, so without this a PATCH setting
 * `type: 'writing'` would be rejected as invalid.
 */
let pluginProjectTypes: string[] = []

export function setPluginProjectModes(types: string[]): void {
  pluginProjectTypes = [...new Set(types)]
}

export function getKnownProjectTypes(): string[] {
  return [...CORE_PROJECT_TYPES, ...pluginProjectTypes]
}

export function isKnownProjectType(type: string): boolean {
  return getKnownProjectTypes().includes(type)
}
