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
let pluginModeOptions = new Map<string, ProjectModeOptions>()

/** Creation-time behaviour a plugin declares for its project function. */
export interface ProjectModeOptions {
  initGit?: boolean
  defaultAgent?: string
}

export function setPluginProjectModes(modes: Array<string | ({ value: string } & ProjectModeOptions)>): void {
  const normalized = modes.map((mode) => (typeof mode === 'string' ? { value: mode } : mode))
  pluginProjectTypes = [...new Set(normalized.map((mode) => mode.value))]
  pluginModeOptions = new Map(
    normalized.map(({ value, initGit, defaultAgent }) => [
      value,
      {
        ...(initGit !== undefined ? { initGit } : {}),
        ...(defaultAgent !== undefined ? { defaultAgent } : {}),
      },
    ]),
  )
}

export function getProjectModeOptions(type: string): ProjectModeOptions {
  return pluginModeOptions.get(type) ?? {}
}

export function getKnownProjectTypes(): string[] {
  return [...CORE_PROJECT_TYPES, ...pluginProjectTypes]
}

export function isKnownProjectType(type: string): boolean {
  return getKnownProjectTypes().includes(type)
}
