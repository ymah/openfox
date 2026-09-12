import { describe, it, expect } from 'vitest'
import { parseAnsi, stripAnsi } from './ansiParser'

const ESC = String.fromCharCode(0x1b)

describe('parseAnsi', () => {
  it('returns plain text unstyled', () => {
    expect(parseAnsi('hello')).toEqual([{ text: 'hello', className: 'text-text-primary' }])
  })

  it('applies a single foreground color', () => {
    const segments = parseAnsi(`${ESC}[31mred${ESC}[0m`)
    expect(segments).toEqual([{ text: 'red', className: 'text-red-400' }])
  })

  it('combines bold and color when set in the SAME escape sequence', () => {
    const segments = parseAnsi(`${ESC}[1;31mbold red${ESC}[0m`)
    expect(segments[0]!.className).toContain('text-red-400')
    expect(segments[0]!.className).toContain('font-bold')
  })

  it('combines bold and color when set via SEPARATE escape sequences (regression)', () => {
    // Real terminal output very commonly emits style and color as distinct
    // codes — a naive "replace the whole class string" implementation loses
    // the bold as soon as the color-only code fires.
    const segments = parseAnsi(`${ESC}[1m${ESC}[31mbold red${ESC}[0m`)
    expect(segments[0]!.className).toContain('font-bold')
    expect(segments[0]!.className).toContain('text-red-400')
  })

  it('keeps an earlier background color active when only the foreground changes later', () => {
    const segments = parseAnsi(`${ESC}[44m${ESC}[33myellow on blue${ESC}[0m`)
    expect(segments[0]!.className).toContain('bg-blue-900')
    expect(segments[0]!.className).toContain('text-accent-warning')
  })

  it('resets only the foreground on code 39, leaving background and styles intact', () => {
    const segments = parseAnsi(`${ESC}[1m${ESC}[44m${ESC}[31mred${ESC}[39mdefault fg${ESC}[0m`)
    expect(segments[0]!.className).toBe('text-red-400 bg-blue-900 font-bold')
    expect(segments[1]!.className).toBe('text-text-primary bg-blue-900 font-bold')
  })

  it('resets only the background on code 49, leaving foreground and styles intact', () => {
    const segments = parseAnsi(`${ESC}[31m${ESC}[44mred on blue${ESC}[49mred only${ESC}[0m`)
    expect(segments[0]!.className).toBe('text-red-400 bg-blue-900')
    expect(segments[1]!.className).toBe('text-red-400')
  })

  it('fully resets on code 0, dropping all accumulated state', () => {
    const segments = parseAnsi(`${ESC}[1;31;44mstyled${ESC}[0mplain`)
    expect(segments[0]!.className).toContain('font-bold')
    expect(segments[1]!.className).toBe('text-text-primary')
  })

  it('falls back to stripping codes it does not recognize without throwing', () => {
    expect(() => parseAnsi(`${ESC}[38;5;123mfoo${ESC}[0m`)).not.toThrow()
  })
})

describe('stripAnsi', () => {
  it('removes escape sequences and keeps the plain text', () => {
    expect(stripAnsi(`${ESC}[1;31mred${ESC}[0m plain`)).toBe('red plain')
  })
})
