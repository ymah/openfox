import { describe, expect, it } from 'vitest'
import { escapeCurrencyDollars, normalizeLatexDelimiters } from './markdown-math'

describe('escapeCurrencyDollars', () => {
  it('leaves text without dollars alone', () => {
    expect(escapeCurrencyDollars('plain text')).toBe('plain text')
  })

  it('escapes prices so they are not read as math', () => {
    expect(escapeCurrencyDollars('It costs $5 and $10 today.')).toBe('It costs \\$5 and \\$10 today.')
    expect(escapeCurrencyDollars('Between $5 to $10')).toBe('Between \\$5 to \\$10')
    expect(escapeCurrencyDollars('Only $9.99')).toBe('Only \\$9.99')
  })

  it('keeps genuine inline math, including ones that start with a digit', () => {
    expect(escapeCurrencyDollars('Let $x^2$ and $a_i$ be given')).toBe('Let $x^2$ and $a_i$ be given')
    expect(escapeCurrencyDollars('Solve $2x+1=5$ now')).toBe('Solve $2x+1=5$ now')
  })

  it('leaves display math alone', () => {
    expect(escapeCurrencyDollars('$$\\frac{1}{2}$$')).toBe('$$\\frac{1}{2}$$')
    expect(escapeCurrencyDollars('$$\n5 + 5\n$$')).toBe('$$\n5 + 5\n$$')
  })

  it('does not touch code', () => {
    const fenced = '```bash\necho $5 and $6\n```'
    expect(escapeCurrencyDollars(fenced)).toBe(fenced)
    expect(escapeCurrencyDollars('run `echo $5` for $5')).toBe('run `echo $5` for \\$5')
  })

  it('is idempotent', () => {
    const once = escapeCurrencyDollars('It costs $5 and $10, and $2x+1$ is math.')
    expect(escapeCurrencyDollars(once)).toBe(once)
  })
})

describe('normalizeLatexDelimiters', () => {
  it('rewrites \\( \\) and \\[ \\] to dollar form', () => {
    expect(normalizeLatexDelimiters('so \\(x^2\\) holds')).toBe('so $x^2$ holds')
    expect(normalizeLatexDelimiters('\\[a+b\\]')).toBe('\n$$\na+b\n$$\n')
  })

  it('leaves text without them, and code, alone', () => {
    expect(normalizeLatexDelimiters('nothing here')).toBe('nothing here')
    const code = '```\n\\(x\\)\n```'
    expect(normalizeLatexDelimiters(code)).toBe(code)
    expect(normalizeLatexDelimiters('use `\\(x\\)` literally')).toBe('use `\\(x\\)` literally')
  })
})
