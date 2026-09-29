// GTD project function, shipped as a bundled first-party plugin: the agents,
// workflows and reference skill that a `gtd` project uses. Everything is scoped
// by the `category: gtd` field on each definition, which the UI filters on.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSource, workflowSource, skillSource } from '../../_shared/content-sources.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {import('openfox/plugin').PluginRegistry} registry */
export function register(registry) {
  registry.registerAgentSource(agentSource('gtd-agents', { en: 'GTD agents', fr: 'Agents GTD' }, join(root, 'agents')))
  registry.registerWorkflowSource(
    workflowSource('gtd-workflows', { en: 'GTD workflows', fr: 'Workflows GTD' }, join(root, 'workflows')),
  )
  registry.registerSkillSource(
    skillSource('gtd-skill', { en: 'GTD reference', fr: 'Référence GTD' }, join(root, 'skill')),
  )
  registry.registerProjectMode({ value: 'gtd', label: { en: 'GTD', fr: 'GTD' } })
}
