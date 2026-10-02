import type { BundledPluginUi } from '@/lib/bundled-plugin-ui'
import { ChatHome } from './ChatHome'
import { MemoryView } from './MemoryView'

/**
 * The chat project home and the Memory page. The core discovers them at build time
 * (web/src/lib/bundled-plugin-ui.ts) and only renders it while this plugin is
 * enabled. The `chat` mode itself is declared in ./modes.ts.
 */
const ui: BundledPluginUi = {
  pluginId: 'openfox-chat',
  pages: [{ path: '/p/:projectId/memory', render: (projectId) => <MemoryView projectId={projectId} /> }],
  nav: [{ path: '/p/:projectId/memory', label: { en: 'Memory', fr: 'Mémoire' } }],
  projectHome: (projectId) => <ChatHome projectId={projectId} />,
}

export default ui
