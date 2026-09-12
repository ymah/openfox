import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_RETRY_PATTERNS } from './auto-patterns.js'

const { getSettingMock } = vi.hoisted(() => ({ getSettingMock: vi.fn() }))

vi.mock('../db/settings.js', () => ({
  getSetting: getSettingMock,
  SETTINGS_KEYS: { RETRY_PATTERNS: 'agent.retryPatterns' },
}))

const { buildRetryPatterns } = await import('./orchestrator.js')

describe('buildRetryPatterns', () => {
  beforeEach(() => {
    getSettingMock.mockReset()
  })

  it('protects against tag-based tool calls by default when nothing was ever saved (fresh install)', async () => {
    getSettingMock.mockReturnValue(null) // no agent.retryPatterns row, no legacy llm.disableXmlProtection row
    const result = await buildRetryPatterns()
    expect(result).toEqual({ retryPatterns: DEFAULT_RETRY_PATTERNS, maxRetriesPerTurn: 10 })
  })

  it('migrates an old disableXmlProtection=false setting to the default protective pattern', async () => {
    getSettingMock.mockImplementation((key: string) => (key === 'llm.disableXmlProtection' ? 'false' : null))
    const result = await buildRetryPatterns()
    expect(result).toEqual({ retryPatterns: DEFAULT_RETRY_PATTERNS, maxRetriesPerTurn: 10 })
  })

  it('honors an old disableXmlProtection=true setting by leaving patterns empty', async () => {
    getSettingMock.mockImplementation((key: string) => (key === 'llm.disableXmlProtection' ? 'true' : null))
    const result = await buildRetryPatterns()
    expect(result).toEqual({ retryPatterns: [], maxRetriesPerTurn: 10 })
  })

  it('uses the explicitly saved patterns once a user has configured them', async () => {
    getSettingMock.mockImplementation((key: string) =>
      key === 'agent.retryPatterns'
        ? JSON.stringify({
            patterns: [{ field: 'content', pattern: 'foo', action: 'retry', active: true }],
            maxRetriesPerTurn: 3,
          })
        : null,
    )
    const result = await buildRetryPatterns()
    expect(result).toEqual({
      retryPatterns: [{ field: 'content', pattern: 'foo', action: 'retry', active: true }],
      maxRetriesPerTurn: 3,
    })
  })
})
