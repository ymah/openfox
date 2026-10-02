import { Link, useLocation } from 'wouter'
import { useT } from '../../hooks/useT'
import { useCurrentProject } from '../../hooks/useCurrentProject'
import { usePlugins } from '../../hooks/usePlugins'
import { navItemsForMode, pluginIdForProjectMode } from '../../lib/bundled-plugin-ui'

/**
 * The pages a project function adds (Codex and Manuscript for a book, Memory for a
 * chat space), reachable from the sidebar wherever you are in the project — they used
 * to be linked only from the project home, so a session had no way back to them.
 * Shown only while the plugin that owns them is enabled.
 */
export function PluginNavLinks({ projectId }: { projectId: string }) {
  const t = useT()
  const [location] = useLocation()
  const project = useCurrentProject()
  const { plugins } = usePlugins()

  const pluginId = pluginIdForProjectMode(project?.type)
  const enabled = plugins.some((plugin) => plugin.id === pluginId && plugin.enabled)
  const items = enabled ? navItemsForMode(project?.type, projectId) : []
  if (items.length === 0) return null

  return (
    <nav className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5" data-testid="plugin-nav">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            location === item.href
              ? 'bg-accent-primary/25 text-text-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          {t(item.label)}
        </Link>
      ))}
    </nav>
  )
}
