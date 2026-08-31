import { createHighlighter, type Highlighter, bundledLanguages } from 'shiki'
import type { ShikiTransformer } from 'shiki'
import { useThemeStore } from '../stores/theme'
import { pathBasename } from './path'

let highlighter: Highlighter | null = null
let highlighterPromise: Promise<Highlighter> | null = null
const loadedLanguages = new Set<string>()
const loadingPromises = new Map<string, Promise<void>>()

// Shiki has no per-language unload API (only getLoadedLanguages()), so a
// language's WASM grammar stays resident in `highlighter` forever once
// loaded. Over a long session touching many languages this grows without
// bound — cap the non-core languages kept loaded at once; beyond the cap,
// the whole highlighter is disposed and recreated fresh (core langs only),
// letting new code blocks reload their language on demand.
const MAX_EXTRA_LANGUAGES = 15
const extraLanguageOrder: string[] = []

const coreLangs: Array<string> = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'bash',
  'json',
  'css',
  'html',
  'sql',
  'yaml',
  'markdown',
  'diff',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'ruby',
  'toml',
  'scss',
  'graphql',
  'docker',
  'powershell',
]

const themes = [
  'github-dark-default',
  'vitesse-light',
  'monokai',
  'dracula',
  'nord',
  'everforest-light',
  'rose-pine-dawn',
  'synthwave-84',
  'one-dark-pro',
  'night-owl',
  'catppuccin-mocha',
  'rose-pine',
  'kanagawa-wave',
  'light-plus',
]

export const THEME_MAP: Record<string, string> = {
  dark: 'github-dark-default',
  light: 'vitesse-light',
  monokai: 'monokai',
  dracula: 'dracula',
  nord: 'nord',
  'rose-pine-dawn': 'rose-pine-dawn',
  'everforest-light': 'everforest-light',
  'synthwave-84': 'synthwave-84',
  'one-dark-pro': 'one-dark-pro',
  'night-owl': 'night-owl',
  'catppuccin-mocha': 'catppuccin-mocha',
  'rose-pine': 'rose-pine',
  'kanagawa-wave': 'kanagawa-wave',
  'light-plus': 'light-plus',
}

export function lineNumbersTransformer(): ShikiTransformer {
  return {
    name: 'line-numbers',
    line(node, line) {
      node.properties['data-line'] = String(line + 1)
    },
  }
}

export async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ themes, langs: coreLangs }).then((h) => {
      highlighter = h
      coreLangs.forEach((lang) => loadedLanguages.add(lang))
      return h
    })
  }
  return highlighterPromise
}

/** Drop the shared highlighter and recreate it fresh (core languages only) — the only way to release loaded grammars, since Shiki has no per-language unload. */
function resetHighlighterForLanguageCap(): void {
  const old = highlighter
  highlighter = null
  highlighterPromise = null
  loadedLanguages.clear()
  coreLangs.forEach((lang) => loadedLanguages.add(lang))
  extraLanguageOrder.length = 0
  loadingPromises.clear()
  old?.dispose()
}

export async function loadLanguage(lang: string): Promise<void> {
  if (loadedLanguages.has(lang)) return

  // Return existing promise if language is already being loaded
  if (loadingPromises.has(lang)) {
    return loadingPromises.get(lang)!
  }

  const loadPromise = (async () => {
    const h = await getHighlighter()

    // Try to load from bundledLanguages first
    const langDef = bundledLanguages[lang as keyof typeof bundledLanguages]
    if (langDef) {
      await h.loadLanguage(langDef)
      loadedLanguages.add(lang)
      extraLanguageOrder.push(lang)
      // Only reset when this is the sole in-flight load — resetting while
      // another loadLanguage() call still holds a reference to the current
      // `highlighter` would dispose an instance it's mid-use of.
      if (extraLanguageOrder.length > MAX_EXTRA_LANGUAGES && loadingPromises.size <= 1) {
        resetHighlighterForLanguageCap()
      }
      return
    }

    // Fallback: try dynamic import for languages not in bundled set
    try {
      const langModule = await import(/* @vite-ignore */ `shiki/langs/${lang}.mjs`)
      if (langModule.default) {
        await h.loadLanguage(langModule.default)
        loadedLanguages.add(lang)
        extraLanguageOrder.push(lang)
        if (extraLanguageOrder.length > MAX_EXTRA_LANGUAGES && loadingPromises.size <= 1) {
          resetHighlighterForLanguageCap()
        }
      }
    } catch (error) {
      console.warn(`Failed to load language ${lang}:`, error)
    }
  })()

  loadingPromises.set(lang, loadPromise)
  await loadPromise
  loadingPromises.delete(lang)
}

// Shiki emits a <span> per token, so the HTML it returns typically weighs
// 8-20x the source. Highlighting a whole large file (a read_file dump, a
// full-file diff) therefore costs tens of MB — retained three times over:
// here in the cache, in each mounted component's state, and as real DOM
// nodes. Above this threshold we skip highlighting entirely and callers fall
// back to plain text (which is also much faster to render).
const MAX_HIGHLIGHT_CHARS = 100 * 1024

// Bounded by entry count AND by total key+value bytes — a count-only cap says
// nothing about size when a single entry can hold megabytes of markup. Same
// design as the markdown render cache in components/shared/Markdown.tsx.
const highlightCache = new Map<string, string>()
const CACHE_MAX = 50
const HIGHLIGHT_CACHE_MAX_BYTES = 24 * 1024 * 1024
let highlightCacheMaxBytes = HIGHLIGHT_CACHE_MAX_BYTES
let highlightCacheBytes = 0

/** Exposed for tests: lets the byte-bounded eviction be verified without generating tens of MB of markup. */
export function getHighlightCacheBytesForTest(): number {
  return highlightCacheBytes
}

/** Exposed for tests: call with no argument to restore the production budget. */
export function setHighlightCacheMaxBytesForTest(bytes = HIGHLIGHT_CACHE_MAX_BYTES): void {
  highlightCacheMaxBytes = bytes
}

function cacheKey(code: string, language: string, theme: string): string {
  return `${code}|${language}|${theme}`
}

function cacheHighlight(key: string, html: string): void {
  highlightCache.set(key, html)
  highlightCacheBytes += key.length + html.length
  while (highlightCache.size > CACHE_MAX || highlightCacheBytes > highlightCacheMaxBytes) {
    const firstKey = highlightCache.keys().next().value
    if (firstKey === undefined) break
    const evicted = highlightCache.get(firstKey)
    highlightCache.delete(firstKey)
    highlightCacheBytes -= firstKey.length + (evicted?.length ?? 0)
  }
}

/** Returns highlighted HTML, or null when the input is too large to highlight — callers render plain text instead. */
export async function highlightCode(
  code: string,
  language: string,
  theme = 'github-dark-default',
): Promise<string | null> {
  if (code.length > MAX_HIGHLIGHT_CHARS) return null

  if (language !== 'text' && !loadedLanguages.has(language)) {
    await loadLanguage(language)
  }

  const key = cacheKey(code, language, theme)
  const cached = highlightCache.get(key)
  if (cached) return cached

  const h = await getHighlighter()
  const result = h.codeToHtml(code, {
    lang: language,
    theme,
    transformers: [lineNumbersTransformer()],
  })

  cacheHighlight(key, result)

  return result
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    highlighter?.dispose()
    highlighter = null
    loadedLanguages.clear()
    loadingPromises.clear()
    extraLanguageOrder.length = 0
  })
}

const extensionToLanguage: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  dockerfile: 'docker',
  makefile: 'makefile',
  cmake: 'cmake',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
}

export function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'text'

  const fileName = pathBasename(filePath)

  const lowerName = fileName.toLowerCase()
  if (lowerName === 'dockerfile') return 'docker'
  if (lowerName === 'makefile') return 'makefile'
  if (lowerName === 'cmakelists.txt') return 'cmake'

  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext) return 'text'

  return extensionToLanguage[ext] ?? 'text'
}

export const wrappedCodeStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  borderRadius: 0,
  fontSize: '0.875rem',
  lineHeight: '1.5rem',
  background: 'transparent',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
}

export function useShikiTheme(): string {
  const currentPreset = useThemeStore((s) => s.currentPreset)
  const isCustom = useThemeStore((s) => s.isCustom)
  const basePreset = useThemeStore((s) => s.basePreset)
  return resolveShikiTheme(currentPreset, isCustom, basePreset)
}

export function getShikiTheme(): string {
  const { currentPreset, isCustom, basePreset } = useThemeStore.getState()
  return resolveShikiTheme(currentPreset, isCustom, basePreset)
}

function resolveShikiTheme(currentPreset: string, isCustom: boolean, basePreset: string): string {
  if (isCustom) {
    if (basePreset && basePreset !== 'system' && THEME_MAP[basePreset]) {
      return THEME_MAP[basePreset] ?? 'github-dark-default'
    }
    return 'github-dark-default'
  }
  return THEME_MAP[currentPreset] ?? 'github-dark-default'
}
