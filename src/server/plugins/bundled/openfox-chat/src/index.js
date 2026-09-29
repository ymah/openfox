// General-purpose chat assistant, shipped as a bundled first-party plugin. It
// owns the whole function: its conversational agents and workflows, the `chat`
// project mode, the cross-conversation memory (tools + RPC), and — through its
// web entry, compiled into the web bundle at build time — the chat home and the
// Memory page.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentSource, workflowSource } from '../../_shared/content-sources.js'
import { createMemoryStore, registerMemoryRpc, registerMemoryTools } from '../server/memory.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {import('openfox/plugin').PluginRegistry} registry */
export function register(registry) {
  registry.registerAgentSource(
    agentSource('chat-agents', { en: 'Chat assistants', fr: 'Assistants de chat' }, join(root, 'agents')),
  )
  registry.registerWorkflowSource(
    workflowSource('chat-workflows', { en: 'Chat workflows', fr: 'Workflows de chat' }, join(root, 'workflows')),
  )
  registry.registerProjectMode({
    value: 'chat',
    label: { en: 'Chat', fr: 'Chat' },
    // A conversation space is not a code repository.
    initGit: false,
    defaultAgent: 'chat-assistant',
  })

  const memory = createMemoryStore(registry.context.storage)
  registerMemoryTools(registry, memory)
  registerMemoryRpc(registry, memory)
}
