import type { BundledPluginUi } from '@/lib/bundled-plugin-ui'
import { CodexView } from './CodexView'
import { ManuscriptView } from './ManuscriptView'
import { SceneWriteView } from './SceneWriteView'
import { WritingHome } from './WritingHome'

/**
 * The novel-writing pages. The core discovers them at build time
 * (web/src/lib/bundled-plugin-ui.ts) and only renders them while this plugin is
 * enabled, so disabling it removes the whole function rather than leaving the
 * editor working without its agents. The `writing` mode itself is declared in
 * ./modes.ts.
 */
const ui: BundledPluginUi = {
  pluginId: 'openfox-writing',
  pages: [
    { path: '/p/:projectId/codex', render: (projectId) => <CodexView projectId={projectId} /> },
    { path: '/p/:projectId/manuscript', render: (projectId) => <ManuscriptView projectId={projectId} /> },
    { path: '/p/:projectId/write', render: (projectId) => <SceneWriteView projectId={projectId} /> },
  ],
  nav: [
    { path: '/p/:projectId/manuscript', label: { en: 'Manuscript', fr: 'Manuscrit' } },
    { path: '/p/:projectId/codex', label: { en: 'Codex', fr: 'Codex' } },
  ],
  projectHome: (projectId) => <WritingHome projectId={projectId} />,
}

export default ui
