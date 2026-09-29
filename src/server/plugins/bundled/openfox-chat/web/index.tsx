import type { BundledPluginUi } from '@/lib/bundled-plugin-ui'
import { ChatHome } from './ChatHome'

/**
 * The chat project home. The core discovers it at build time
 * (web/src/lib/bundled-plugin-ui.ts) and only renders it while this plugin is
 * enabled. The `chat` mode itself is declared in ./modes.ts.
 */
const ui: BundledPluginUi = {
  pluginId: 'openfox-chat',
  pages: [],
  projectHome: (projectId) => <ChatHome projectId={projectId} />,
}

export default ui
