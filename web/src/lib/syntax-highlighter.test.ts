// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'

const mockCreateHighlighter = vi.fn()
const mockLoadLanguage = vi.fn()
const mockDispose = vi.fn()

let resolveCreate: ((h: typeof mockHighlighter) => void) | null = null
const mockHighlighter = {
  loadLanguage: mockLoadLanguage,
  dispose: mockDispose,
  codeToHtml: vi.fn(() => '<pre>code</pre>'),
}

vi.mock('shiki', () => ({
  createHighlighter: (...args: unknown[]) => {
    mockCreateHighlighter(...args)
    return new Promise((resolve) => {
      resolveCreate = resolve
    })
  },
  bundledLanguages: {
    kotlin: 'kotlin-loader',
    swift: 'swift-loader',
    lang1: 'lang1-loader',
    lang2: 'lang2-loader',
    lang3: 'lang3-loader',
    lang4: 'lang4-loader',
    lang5: 'lang5-loader',
    lang6: 'lang6-loader',
    lang7: 'lang7-loader',
    lang8: 'lang8-loader',
    lang9: 'lang9-loader',
    lang10: 'lang10-loader',
    lang11: 'lang11-loader',
    lang12: 'lang12-loader',
    lang13: 'lang13-loader',
    lang14: 'lang14-loader',
  },
}))

describe('syntax-highlighter', () => {
  it('creates highlighter only once under concurrent calls', async () => {
    vi.clearAllMocks()
    resolveCreate = null

    const mod = await import('./syntax-highlighter')

    const promise1 = mod.getHighlighter()
    const promise2 = mod.getHighlighter()

    resolveCreate!(mockHighlighter)

    const [h1, h2] = await Promise.all([promise1, promise2])

    expect(mockCreateHighlighter).toHaveBeenCalledTimes(1)
    expect(h1).toBe(h2)
  })

  it('loads a language not in coreLangs from bundledLanguages', async () => {
    vi.clearAllMocks()
    resolveCreate = null

    const mod = await import('./syntax-highlighter')

    // Highlighter already created by previous test — getHighlighter returns instantly
    await mod.loadLanguage('kotlin')

    expect(mockLoadLanguage).toHaveBeenCalledWith('kotlin-loader')
  })

  it('does not reload an already loaded language', async () => {
    vi.clearAllMocks()

    const mod = await import('./syntax-highlighter')

    await mod.loadLanguage('kotlin')
    await mod.loadLanguage('kotlin')

    expect(mockLoadLanguage).toHaveBeenCalledTimes(0)
  })

  it('deduplicates concurrent loadLanguage calls for the same language', async () => {
    vi.clearAllMocks()

    const mod = await import('./syntax-highlighter')

    await Promise.all([mod.loadLanguage('swift'), mod.loadLanguage('swift')])

    expect(mockLoadLanguage).toHaveBeenCalledTimes(1)
  })

  it('disposes and recreates the highlighter once the extra-language cap is exceeded', async () => {
    vi.clearAllMocks()

    const mod = await import('./syntax-highlighter')

    // Sequential (not concurrent) loads of enough distinct languages to push
    // extraLanguageOrder past MAX_EXTRA_LANGUAGES (15) — module state carries
    // over from earlier tests in this file (kotlin, swift already loaded).
    for (let i = 1; i <= 14; i++) {
      await mod.loadLanguage(`lang${i}`)
    }

    expect(mockDispose).toHaveBeenCalled()

    // The reset nulls highlighterPromise, so the next getHighlighter() call
    // must recreate the highlighter — resolve that fresh promise manually,
    // same as the "creates highlighter only once" test above.
    const createCallsBefore = mockCreateHighlighter.mock.calls.length
    const reloadPromise = mod.loadLanguage('kotlin')
    resolveCreate!(mockHighlighter)
    await reloadPromise

    expect(mockCreateHighlighter.mock.calls.length).toBe(createCallsBefore + 1)
  })

  describe('useShikiTheme', () => {
    it('maps custom theme with light basePreset to vitesse-light', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: 'light', currentPreset: 'light' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('vitesse-light')
    })

    it('maps custom theme with dark basePreset to github-dark-default', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: 'dark', currentPreset: 'dark' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('github-dark-default')
    })

    it('maps custom theme with dracula basePreset to dracula', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: 'dracula', currentPreset: 'dracula' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('dracula')
    })

    it('maps custom theme with monokai basePreset to monokai', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: 'monokai', currentPreset: 'monokai' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('monokai')
    })

    it('maps custom theme with nord basePreset to nord', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: 'nord', currentPreset: 'nord' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('nord')
    })

    it('falls back to github-dark-default for unknown basePreset', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: true, basePreset: '', currentPreset: 'dark' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('github-dark-default')
    })

    it('uses THEME_MAP for non-custom preset', async () => {
      const { useThemeStore } = await import('../stores/theme')
      useThemeStore.setState({ isCustom: false, currentPreset: 'monokai' })

      const mod = await import('./syntax-highlighter')
      const theme = mod.getShikiTheme()
      expect(theme).toBe('monokai')
    })
  })

  describe('getLanguageFromPath', () => {
    it('detects extension-less names on Unix and Windows paths', async () => {
      const mod = await import('./syntax-highlighter')

      expect(mod.getLanguageFromPath('/home/me/app/Dockerfile')).toBe('docker')
      expect(mod.getLanguageFromPath('C:\\Users\\me\\app\\Dockerfile')).toBe('docker')
      expect(mod.getLanguageFromPath('C:\\Users\\me\\app\\CMakeLists.txt')).toBe('cmake')
      expect(mod.getLanguageFromPath('C:\\Users\\me\\app\\main.rs')).toBe('rust')
    })
  })

  describe('highlightCode size limits', () => {
    it('skips highlighting (and caching) content above the size threshold', async () => {
      const mod = await import('./syntax-highlighter')
      mockHighlighter.codeToHtml.mockClear()

      const bytesBefore = mod.getHighlightCacheBytesForTest()
      // Shiki markup weighs 8-20x the source, so highlighting a whole large
      // file is what put multi-MB strings in the cache, in component state
      // and in the DOM all at once. Callers fall back to plain text.
      const huge = 'a'.repeat(100 * 1024 + 1)

      await expect(mod.highlightCode(huge, 'typescript')).resolves.toBeNull()
      expect(mockHighlighter.codeToHtml).not.toHaveBeenCalled()
      expect(mod.getHighlightCacheBytesForTest()).toBe(bytesBefore)
    })

    it('still highlights content just under the threshold', async () => {
      const mod = await import('./syntax-highlighter')
      mockHighlighter.codeToHtml.mockClear()

      await expect(mod.highlightCode('const x = 1', 'typescript')).resolves.toBe('<pre>code</pre>')
      expect(mockHighlighter.codeToHtml).toHaveBeenCalled()
    })

    it('evicts cache entries once the byte budget is exceeded', async () => {
      const mod = await import('./syntax-highlighter')
      // A small budget proves the eviction without generating tens of MB.
      mod.setHighlightCacheMaxBytesForTest(2000)
      try {
        for (let i = 0; i < 20; i++) {
          await mod.highlightCode(`const distinct${i} = ${'x'.repeat(200)}`, 'typescript')
        }
        expect(mod.getHighlightCacheBytesForTest()).toBeLessThanOrEqual(2000)
      } finally {
        mod.setHighlightCacheMaxBytesForTest()
      }
    })
  })
})
