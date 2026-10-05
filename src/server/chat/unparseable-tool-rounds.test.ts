import { describe, expect, it } from 'vitest'
import { createUnparseableRoundCounter } from './unparseable-tool-rounds.js'

const bad = [{ parseError: 'Unexpected end of JSON input' }]
const good = [{}]

describe('createUnparseableRoundCounter', () => {
  it('trips after the maximum number of consecutive unparseable rounds', () => {
    const counter = createUnparseableRoundCounter(3)
    expect(counter.record(bad)).toBe(false)
    expect(counter.record(bad)).toBe(false)
    expect(counter.record(bad)).toBe(true)
  })

  it('resets when a round has at least one usable call', () => {
    const counter = createUnparseableRoundCounter(3)
    counter.record(bad)
    counter.record(bad)
    expect(counter.record([...bad, ...good])).toBe(false)
    expect(counter.record(bad)).toBe(false)
    expect(counter.record(bad)).toBe(false)
    expect(counter.record(bad)).toBe(true)
  })

  it('does not count a round without tool calls', () => {
    const counter = createUnparseableRoundCounter(2)
    counter.record(bad)
    expect(counter.record([])).toBe(false)
    expect(counter.record(bad)).toBe(false)
  })
})
