import { describe, it, expect } from 'vitest'
import { PROJECT_MODES, DEFAULT_PROJECT_TYPE, getProjectMode } from './project-modes'

describe('PROJECT_MODES', () => {
  it('includes dev, gtd, and writing, each with a unique value', () => {
    const values = PROJECT_MODES.map((m) => m.value)
    expect(values).toEqual(['dev', 'gtd', 'writing'])
    expect(new Set(values).size).toBe(values.length)
  })

  it('defaults to dev', () => {
    expect(DEFAULT_PROJECT_TYPE).toBe('dev')
  })

  it('only dev shows dev chrome', () => {
    expect(PROJECT_MODES.find((m) => m.value === 'dev')?.showsDevChrome).toBe(true)
    expect(PROJECT_MODES.find((m) => m.value === 'gtd')?.showsDevChrome).toBe(false)
    expect(PROJECT_MODES.find((m) => m.value === 'writing')?.showsDevChrome).toBe(false)
  })

  it('writing is the only mode with a custom project home', () => {
    expect(PROJECT_MODES.find((m) => m.value === 'writing')?.hasCustomHome).toBe(true)
    expect(PROJECT_MODES.find((m) => m.value === 'dev')?.hasCustomHome).toBeUndefined()
    expect(PROJECT_MODES.find((m) => m.value === 'gtd')?.hasCustomHome).toBeUndefined()
  })
})

describe('getProjectMode', () => {
  it('resolves each known type to its own definition', () => {
    expect(getProjectMode('gtd').value).toBe('gtd')
    expect(getProjectMode('writing').value).toBe('writing')
  })

  it('falls back to the first mode (dev) for an unknown/undefined type', () => {
    expect(getProjectMode(undefined).value).toBe('dev')
  })
})
