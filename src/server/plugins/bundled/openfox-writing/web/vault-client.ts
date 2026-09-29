import { invokePluginRpc } from '@/lib/plugin-actions'
import type { CodexEntry, CodexType } from './types'
import type { ActSummary } from './types'

/**
 * Typed access to this plugin's vault RPC methods. These used to be REST routes
 * in the core (`/api/projects/:id/codex…`); they are the plugin's own now, so the
 * whole writing function lives in one place.
 *
 * The server resolves the project's workdir from `projectId` — the caller cannot
 * choose a directory.
 */
const PLUGIN_ID = 'openfox-writing'

function call<T>(method: string, projectId: string, params: Record<string, unknown> = {}): Promise<T> {
  return invokePluginRpc(PLUGIN_ID, method, params, { projectId }) as Promise<T>
}

export function listCodex(projectId: string): Promise<{ entries: CodexEntry[] }> {
  return call('codex.list', projectId)
}

export function saveCodexEntry(
  projectId: string,
  entry: { type: CodexType; slug: string; title: string; tags: string[]; facts: Record<string, unknown>; body: string },
): Promise<CodexEntry> {
  return call('codex.save', projectId, entry)
}

export function getManuscript(projectId: string): Promise<{ acts: ActSummary[] }> {
  return call('manuscript.tree', projectId)
}

export function getScene(
  projectId: string,
  path: string,
): Promise<{ path: string; frontmatter: Record<string, unknown>; body: string }> {
  return call('scene.get', projectId, { path })
}

export function saveScene(
  projectId: string,
  path: string,
  frontmatter: Record<string, unknown>,
  body: string,
): Promise<{ path: string }> {
  return call('scene.save', projectId, { path, frontmatter, body })
}
