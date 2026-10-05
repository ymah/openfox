import { describe, expect, it } from 'vitest'
import { parseSystemThemePrefs, parseUserPresets } from './theme-parse'

const preset = { id: 'p1', name: 'Mine', basePreset: 'dark', tokens: { '--bg': '#000' } }

describe('parseUserPresets', () => {
  it('keeps well-formed presets', () => {
    expect(parseUserPresets(JSON.stringify([preset]))).toEqual([preset])
  })

  it.each([null, undefined, '', '{', 'null', '{"a":1}', '-1', 'true', '"x"', '[1,2,3]', '{"presets":5}'])(
    'returns an empty list for %j',
    (raw) => {
      expect(parseUserPresets(raw as string | null | undefined)).toEqual([])
    },
  )

  it('drops malformed entries but keeps the good ones', () => {
    expect(parseUserPresets(JSON.stringify([preset, null, { id: 5 }, { id: 'x', name: 'y' }]))).toEqual([preset])
  })
})

describe('parseSystemThemePrefs', () => {
  const fallback = { darkPreset: 'dark', lightPreset: 'light' }

  it('reads valid preferences', () => {
    expect(parseSystemThemePrefs('{"darkPreset":"a","lightPreset":"b"}', fallback)).toEqual({
      darkPreset: 'a',
      lightPreset: 'b',
    })
  })

  it.each([null, '', '{', 'null', '[]', '{"darkPreset":1}', '5'])('falls back for %j', (raw) => {
    expect(parseSystemThemePrefs(raw, fallback)).toEqual(fallback)
  })
})
