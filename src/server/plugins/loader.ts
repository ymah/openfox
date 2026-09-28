import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PluginContext, PluginDefinition, PluginManifest } from '../../plugin/index.js'
import { pluginManifestSchema } from '../../plugin/index.js'
import type { PluginContributionSummary, PluginCapability } from '../../shared/plugin.js'
import { EMPTY_PLUGIN_CONTRIBUTIONS } from '../../shared/plugin.js'
import type { PluginRegistry } from './registry.js'

export interface PluginDiagnostic {
  packageName: string
  version?: string
  source: string
  loaded: boolean
  apiVersion: number
  displayName: string
  description?: string
  icon?: string
  logo?: string
  capabilities: PluginCapability[]
  timeoutMs?: number
  enabled: boolean
  error?: string
  authAdapters: string[]
  transportAdapters: string[]
  presets: string[]
  contributions: PluginContributionSummary
}

export interface LoadPluginsOptions {
  registry: PluginRegistry
  configDirectory: string
  cwd?: string
  createContext?: (manifest: PluginManifest, source: string) => PluginContext
  onModule?: (packageName: string, module: Partial<PluginDefinition>) => void
  shouldLoad?: (packageName: string) => boolean
  /** Skip the roots shipped inside the package. Tests use it for isolation. */
  includeBundled?: boolean
}

const __bundleDir = dirname(fileURLToPath(import.meta.url))

/**
 * Plugins shipped inside the openfox package itself (first-party, e.g. the GTD
 * and writing modes). Two candidates for the same reason the agent/skill/
 * workflow registries keep a pair: running from source, this file sits in
 * `src/server/plugins/`, so the sources are next to it; in the published
 * package everything collapses into flat `dist/` chunks and the directory is
 * copied to `dist/bundled-plugins` by scripts/copy-assets.mjs. A root that does
 * not exist is skipped silently, so listing both is free.
 */
export function bundledPluginRoots(): string[] {
  return [join(__bundleDir, 'bundled'), join(__bundleDir, 'bundled-plugins')]
}

export function pluginRoots(configDirectory: string, cwd?: string, includeBundled = true): string[] {
  const pluginsDir = join(configDirectory, 'plugins')
  return [
    pluginsDir,
    join(pluginsDir, 'node_modules'),
    join(cwd ?? process.cwd(), 'node_modules'),
    // Last: discovery dedupes by package name, first root winning, so a plugin
    // the user installed under the same name overrides the bundled copy —
    // and uninstalling it restores the bundled one on the next start.
    ...(includeBundled ? bundledPluginRoots() : []),
  ]
}

export function resolvePluginEntry(manifest: PluginManifest): string | undefined {
  return manifest.openfox.entry ?? manifest.openfox.plugin
}

export async function readPluginManifest(packageDir: string): Promise<PluginManifest | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as unknown
    const parsed = pluginManifestSchema.safeParse(raw)
    if (!parsed.success) return undefined
    const data = parsed.data
    return {
      name: data.name,
      version: data.version,
      openfox: {
        apiVersion: data.openfox.apiVersion,
        ...(data.openfox.entry ? { entry: data.openfox.entry } : {}),
        ...(data.openfox.plugin ? { plugin: data.openfox.plugin } : {}),
        ...(data.openfox.displayName ? { displayName: data.openfox.displayName } : {}),
        ...(data.openfox.description ? { description: data.openfox.description } : {}),
        ...(data.openfox.icon ? { icon: data.openfox.icon } : {}),
        ...(data.openfox.logo ? { logo: data.openfox.logo } : {}),
        ...(data.openfox.capabilities ? { capabilities: data.openfox.capabilities as PluginCapability[] } : {}),
        ...(data.openfox.timeoutMs ? { timeoutMs: data.openfox.timeoutMs } : {}),
      },
    }
  } catch {
    return undefined
  }
}

function baseDiagnostic(manifest: PluginManifest, source: string): PluginDiagnostic {
  return {
    packageName: manifest.name,
    version: manifest.version,
    source,
    loaded: false,
    apiVersion: manifest.openfox.apiVersion,
    displayName: manifest.openfox.displayName ?? manifest.name,
    ...(manifest.openfox.description ? { description: manifest.openfox.description } : {}),
    ...(manifest.openfox.icon ? { icon: manifest.openfox.icon } : {}),
    ...(manifest.openfox.logo ? { logo: manifest.openfox.logo } : {}),
    capabilities: manifest.openfox.capabilities ?? [],
    ...(manifest.openfox.timeoutMs ? { timeoutMs: manifest.openfox.timeoutMs } : {}),
    enabled: true,
    authAdapters: [],
    transportAdapters: [],
    presets: [],
    contributions: { ...EMPTY_PLUGIN_CONTRIBUTIONS },
  }
}

export async function loadPluginFromDirectory(options: {
  registry: PluginRegistry
  packageDir: string
  manifest: PluginManifest
  createContext?: (manifest: PluginManifest, source: string) => PluginContext
  onModule?: (packageName: string, module: Partial<PluginDefinition>) => void
  cacheBust?: boolean
}): Promise<PluginDiagnostic> {
  const { registry, packageDir, manifest } = options
  const diagnostic = baseDiagnostic(manifest, packageDir)

  if (manifest.openfox.apiVersion !== 1 && manifest.openfox.apiVersion !== 2) {
    diagnostic.error = `Unsupported OpenFox plugin API version: ${manifest.openfox.apiVersion}`
    return diagnostic
  }

  const entry = resolvePluginEntry(manifest)
  if (!entry) {
    diagnostic.error = 'Plugin package.json is missing openfox.entry'
    return diagnostic
  }

  const context = options.createContext?.(manifest, packageDir) ?? noopContext(manifest)
  registry.beginPlugin(manifest.name, context)
  try {
    const entryUrl = pathToFileURL(join(packageDir, entry)).href
    const module = (await import(
      options.cacheBust ? `${entryUrl}?v=${Date.now()}` : entryUrl
    )) as Partial<PluginDefinition>
    if (typeof module.register !== 'function') throw new Error('Plugin does not export register(registry)')
    options.onModule?.(manifest.name, module)
    await module.register(registry)
    diagnostic.loaded = true
    diagnostic.contributions = registry.getContributionSummary(manifest.name)
    const conflicts = registry.getConflicts()
    if (conflicts.length > 0) {
      diagnostic.loaded = false
      diagnostic.error = conflicts.join('; ')
      registry.removePlugin(manifest.name)
      diagnostic.contributions = registry.getContributionSummary(manifest.name)
    }
    registry.clearConflicts()
    diagnostic.authAdapters = contributionIds(registry, manifest.name, 'auth')
    diagnostic.transportAdapters = contributionIds(registry, manifest.name, 'transport')
    diagnostic.presets = contributionIds(registry, manifest.name, 'preset')
  } catch (error) {
    diagnostic.error = error instanceof Error ? error.message : String(error)
    registry.removePlugin(manifest.name)
    registry.clearConflicts()
  } finally {
    registry.endPlugin()
  }

  return diagnostic
}

function contributionIds(registry: PluginRegistry, pluginId: string, kind: string): string[] {
  return registry
    .listContributions(pluginId)
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.id)
}

function noopContext(manifest: PluginManifest): PluginContext {
  return {
    id: manifest.name,
    version: manifest.version,
    runtime: { mode: 'production', configDirectory: '' },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    storage: { get: () => undefined, set: () => {} },
    settings: () => ({}),
    notify: () => {},
    publish: () => {},
  }
}

async function packageDirectories(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const directories: string[] = []
  for (const entry of entries) {
    const entryPath = join(root, entry.name)
    const isDirectory =
      entry.isDirectory() || (entry.isSymbolicLink() && (await stat(entryPath).catch(() => undefined))?.isDirectory())
    if (!isDirectory) continue
    if (entry.name.startsWith('@')) {
      const scoped = await readdir(entryPath, { withFileTypes: true }).catch(() => [])
      for (const child of scoped) {
        const childPath = join(entryPath, child.name)
        const childIsDirectory =
          child.isDirectory() ||
          (child.isSymbolicLink() && (await stat(childPath).catch(() => undefined))?.isDirectory())
        if (childIsDirectory) directories.push(childPath)
      }
    } else {
      directories.push(entryPath)
    }
  }
  return directories
}

export async function loadPlugins(options: LoadPluginsOptions): Promise<PluginDiagnostic[]> {
  const seen = new Set<string>()
  const diagnostics: PluginDiagnostic[] = []

  for (const root of pluginRoots(options.configDirectory, options.cwd, options.includeBundled ?? true)) {
    for (const packageDir of await packageDirectories(root)) {
      const manifest = await readPluginManifest(packageDir)
      if (!manifest) continue
      if (seen.has(manifest.name)) continue
      seen.add(manifest.name)
      if (options.shouldLoad && !options.shouldLoad(manifest.name)) {
        diagnostics.push({ ...baseDiagnostic(manifest, packageDir), enabled: false })
        continue
      }
      diagnostics.push(await loadPluginFromDirectory({ ...options, packageDir, manifest }))
    }
  }

  return diagnostics
}

export { loadPlugins as loadProviderPlugins }
export type { PluginDiagnostic as ProviderPluginDiagnostic }
