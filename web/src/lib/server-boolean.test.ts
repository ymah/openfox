import { describe, expect, it } from 'vitest'
import { parseServerBoolean } from './server-boolean'

describe('parseServerBoolean', () => {
  it('reads the two explicit values', () => {
    expect(parseServerBoolean('true')).toBe(true)
    expect(parseServerBoolean('false')).toBe(false)
  })

  it('treats the not-loaded fallback and anything else as no value, never as false', () => {
    expect(parseServerBoolean('')).toBeUndefined()
    expect(parseServerBoolean(undefined)).toBeUndefined()
    expect(parseServerBoolean('yes')).toBeUndefined()
    expect(parseServerBoolean('TRUE')).toBeUndefined()
  })
})
