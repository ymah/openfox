import { describe, expect, it } from 'vitest'
import { extractGrowingJsonField } from './extractPartialToolArgs.js'

describe('extractGrowingJsonField', () => {
  it('extracts a complete field value', () => {
    expect(extractGrowingJsonField('{"path":"src/foo.ts","content":"hello"}', 'content')).toBe('hello')
  })

  it('extracts a still-streaming (unterminated) field value', () => {
    expect(extractGrowingJsonField('{"path":"src/foo.ts","content":"hello wor', 'content')).toBe('hello wor')
  })

  it('returns null when the field has not appeared yet', () => {
    expect(extractGrowingJsonField('{"path":"src/foo.ts","conte', 'content')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(extractGrowingJsonField('', 'content')).toBeNull()
  })

  it('unescapes standard JSON string escapes', () => {
    expect(extractGrowingJsonField('{"content":"line1\\nline2\\ttabbed"}', 'content')).toBe('line1\nline2\ttabbed')
  })

  it('unescapes escaped quotes and backslashes within the value', () => {
    expect(extractGrowingJsonField('{"content":"say \\"hi\\" and C:\\\\\\\\path"}', 'content')).toBe(
      'say "hi" and C:\\\\path',
    )
  })

  it('stops at an unescaped closing quote, not grabbing the rest of the object', () => {
    expect(extractGrowingJsonField('{"path":"src/foo.ts","content":"done"}', 'path')).toBe('src/foo.ts')
  })

  it('handles a value truncated mid-escape-sequence without crashing', () => {
    // Stream cut off right after a lone backslash — nothing after it yet.
    expect(extractGrowingJsonField('{"content":"line1\\', 'content')).toBe('line1')
  })

  it('extracts the second of two fields independently', () => {
    const partial = '{"path":"src/foo.ts","old_string":"function foo() {","new_string":"function bar() {'
    expect(extractGrowingJsonField(partial, 'old_string')).toBe('function foo() {')
    expect(extractGrowingJsonField(partial, 'new_string')).toBe('function bar() {')
  })
})
