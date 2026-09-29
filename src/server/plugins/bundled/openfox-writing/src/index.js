// Novel-writing project function, shipped as a bundled first-party plugin. It
// owns the whole function: its agents, workflows and skill, the `writing` project
// mode, the Codex/manuscript vault operations (as RPC), and — through its web
// entry, compiled into the web bundle at build time — its three editor pages.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSource, workflowSource, skillSource } from '../../_shared/content-sources.js'
import { registerVaultRpc } from '../server/vault.js'

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
  registry.registerProjectMode({ value: 'writing', label: { en: 'Writing', fr: 'Écriture' } })
  registerVaultRpc(registry)
}
