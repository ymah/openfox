/**
 * Single-dollar inline math ($x^2$) is what chat models emit, but it collides
 * with prices: "it costs $5 and $10" would render "5 and " as a formula. The
 * markdown parser cannot tell the two apart, so a `$` that is followed by a
 * digit and that does not close a formula the way maths does (no space before
 * the closing `$`) is escaped before parsing.
 *
 * Code (fenced blocks and inline code) is never touched, and `$$…$$` display
 * math is left alone.
 */
export function escapeCurrencyDollars(markdown: string): string {
  if (!markdown.includes('$')) return markdown
  const lines = markdown.split('\n')
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence || !line.includes('$')) continue
    lines[i] = escapeLine(line)
  }
  return lines.join('\n')
}

function escapeLine(line: string): string {
  // Split out inline code spans so their dollars are left as they are.
  return line
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : escapeSegment(part)))
    .join('')
}

function escapeSegment(text: string): string {
  const out = text.split('')
  const dollars: number[] = []
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== '$') continue
    if (out[i - 1] === '\\') continue // already escaped
    if (out[i + 1] === '$') {
      i++ // $$ display math delimiter: skip both
      continue
    }
    dollars.push(i)
  }

  for (let k = 0; k < dollars.length; k++) {
    const open = dollars[k]!
    if (!/\d/.test(out[open + 1] ?? '')) continue // not a price-like `$<digit>`
    const close = dollars[k + 1]
    const closesLikeMath = close !== undefined && !/\s/.test(out[close - 1] ?? ' ')
    if (closesLikeMath) {
      k++ // a genuine $…$ pair such as $2x+1$: keep both
      continue
    }
    out[open] = '\\$'
  }
  return out.join('')
}

/**
 * Models often write math as \( … \) and \[ … \], which markdown would read as
 * escaped brackets. Rewrite them to the $ … $ / $$ … $$ form the parser
 * understands. Code (fenced blocks, inline code) is left untouched.
 */
export function normalizeLatexDelimiters(markdown: string): string {
  if (!markdown.includes('\\(') && !markdown.includes('\\[')) return markdown
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : rewriteDelimiters(part)))
    .join('')
}

function rewriteDelimiters(text: string): string {
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(/\\\(([^\n]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`)
}
