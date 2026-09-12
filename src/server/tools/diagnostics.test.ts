import { describe, it, expect } from 'vitest'
import { formatDiagnosticsForLLM, appendLspInstallHint } from './diagnostics.js'
import type { Diagnostic } from '../../shared/types.js'
import type { LspManagerInterface } from '../lsp/types.js'

function diag(severity: Diagnostic['severity'], line: number, message: string): Diagnostic {
  return {
    severity,
    message,
    path: '/a/b.ts',
    source: 'test',
    range: { start: { line, character: 0 }, end: { line, character: 0 } },
  }
}

describe('formatDiagnosticsForLLM', () => {
  it('returns empty string when there are no diagnostics', () => {
    expect(formatDiagnosticsForLLM([])).toBe('')
  })

  it('counts errors and warnings', () => {
    const output = formatDiagnosticsForLLM([diag('error', 0, 'boom'), diag('warning', 1, 'careful')])
    expect(output).toContain('LSP found 1 error(s), 1 warning(s):')
    expect(output).toContain('Line 1: [error] boom')
    expect(output).toContain('Line 2: [warning] careful')
  })

  it('falls back to a note count instead of "LSP found :" when only info/hint diagnostics exist', () => {
    const output = formatDiagnosticsForLLM([diag('info', 0, 'fyi'), diag('hint', 1, 'consider this')])
    expect(output).not.toContain('LSP found :')
    expect(output).toContain('LSP found 2 note(s):')
  })

  it('caps the listed diagnostics at 10, noting how many were omitted', () => {
    const many = Array.from({ length: 12 }, (_, i) => diag('error', i, `err-${i}`))
    const output = formatDiagnosticsForLLM(many)
    expect(output).toContain('LSP found 12 error(s):')
    expect(output).toContain('... and 2 more')
  })
})

describe('appendLspInstallHint', () => {
  it('returns output unchanged when there is no lsp manager', () => {
    expect(appendLspInstallHint('base', undefined, '/a/b.ts')).toBe('base')
  })

  it('returns output unchanged when the manager has no hint', () => {
    const manager = { getInstallHint: () => null } as unknown as LspManagerInterface
    expect(appendLspInstallHint('base', manager, '/a/b.ts')).toBe('base')
  })

  it('appends the install hint when present', () => {
    const manager = {
      getInstallHint: () => 'npm install -g typescript-language-server',
    } as unknown as LspManagerInterface
    const output = appendLspInstallHint('base', manager, '/a/b.ts')
    expect(output).toContain('base')
    expect(output).toContain('npm install -g typescript-language-server')
  })
})
