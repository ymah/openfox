import { describe, expect, it } from 'vitest'
import { mcpFieldError } from './validate-fields.js'

describe('mcpFieldError', () => {
  it('accepts a well-formed definition', () => {
    expect(mcpFieldError({ name: 'files-2.0', command: 'npx', args: ['-y', 'x'], env: { A: '1' } })).toBeNull()
    expect(mcpFieldError({ name: 'remote', url: 'https://x/mcp', headers: { Authorization: 'Bearer t' } })).toBeNull()
  })

  it.each(['', '../x', 'a/b', 'has space', '.hidden', 'x'.repeat(65)])('rejects the name %j', (name) => {
    expect(mcpFieldError({ name })).toMatch(/name/)
  })

  it('rejects a missing or non-string name', () => {
    expect(mcpFieldError({})).toMatch(/name/)
    expect(mcpFieldError({ name: 5 })).toMatch(/name/)
  })

  it('rejects wrongly typed fields', () => {
    expect(mcpFieldError({ name: 'a', command: 5 })).toMatch(/command/)
    expect(mcpFieldError({ name: 'a', args: 'x' })).toMatch(/args/)
    expect(mcpFieldError({ name: 'a', args: [1] })).toMatch(/args/)
    expect(mcpFieldError({ name: 'a', env: 'x' })).toMatch(/env/)
    expect(mcpFieldError({ name: 'a', env: { A: 1 } })).toMatch(/env/)
    expect(mcpFieldError({ name: 'a', url: [] })).toMatch(/url/)
    expect(mcpFieldError({ name: 'a', headers: [] })).toMatch(/headers/)
  })
})
