// Novel-writing project function, shipped as a bundled first-party plugin: the
// agents, workflows and reference skill a `writing` project uses, scoped by the
// `category: writing` field on each definition.
//
// The Codex/manuscript REST routes and their editor views deliberately stay in
// the core: the declarative panel format has no multi-line editor node and
// plugins cannot contribute an application route, so moving them would mean
// rebuilding the editors as sandboxed iframe modals.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSource, workflowSource, skillSource } from '../../_shared/content-sources.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {import('openfox/plugin').PluginRegistry} registry */
export function register(registry) {
  registry.registerAgentSource(
    agentSource('writing-agents', { en: 'Writing agents', fr: 'Agents d’écriture' }, join(root, 'agents')),
  )
  registry.registerWorkflowSource(
    workflowSource(
      'writing-workflows',
      { en: 'Writing workflows', fr: 'Workflows d’écriture' },
      join(root, 'workflows'),
    ),
  )
  registry.registerSkillSource(
    skillSource('writing-skill', { en: 'Writing reference', fr: 'Référence d’écriture' }, join(root, 'skill')),
  )
}
