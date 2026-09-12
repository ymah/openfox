/**
 * ANSI color code parser for terminal output
 * Converts ANSI escape sequences to React elements with Tailwind CSS styling
 */

// ANSI color code mappings to Tailwind CSS classes
const ANSI_COLORS: Record<number, string> = {
  30: 'text-black',
  31: 'text-red-400',
  32: 'text-accent-success',
  33: 'text-accent-warning',
  34: 'text-blue-400',
  35: 'text-purple-400',
  36: 'text-cyan-400',
  37: 'text-gray-300',
  90: 'text-gray-500', // bright black
  91: 'text-red-500', // bright red
  92: 'text-green-500', // bright green
  93: 'text-yellow-400', // bright yellow
  94: 'text-blue-500', // bright blue
  95: 'text-pink-400', // bright magenta
  96: 'text-cyan-500', // bright cyan
  97: 'text-white', // bright white
}

const ANSI_BG_COLORS: Record<number, string> = {
  40: 'bg-black',
  41: 'bg-red-900',
  42: 'bg-green-900',
  43: 'bg-yellow-900',
  44: 'bg-blue-900',
  45: 'bg-purple-900',
  46: 'bg-cyan-900',
  47: 'bg-gray-700',
}

const ANSI_STYLES: Record<number, string> = {
  1: 'font-bold',
  2: 'opacity-75', // dim
  4: 'underline',
  7: 'bg-bg-secondary', // inverse
}

// Reset all styles
const ANSI_RESET = 'text-text-primary'

interface ParsedSegment {
  text: string
  className: string
}

/**
 * Parse ANSI escape sequences and return array of styled segments
 * Falls back to stripping codes if parsing fails
 */
export function parseAnsi(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []

  // Regex to match ANSI escape sequences
  const ansiRegex = new RegExp(String.fromCharCode(0x1b) + '\\[([0-9;]+)m', 'g')

  let lastIndex = 0
  let match: RegExpExecArray | null

  // SGR state persists cumulatively across separate escape sequences — real
  // terminal output very commonly emits color and style as separate codes
  // (e.g. "\x1b[1m" then "\x1b[31m" for bold red), and each one only ever
  // touches its own attribute (fg/bg/style), never the others.
  let fg: string | null = null
  let bg: string | null = null
  const styles = new Set<number>()

  const buildClasses = (): string => {
    const classes = [fg ?? ANSI_RESET]
    if (bg) classes.push(bg)
    for (const s of styles) {
      const styleClass = ANSI_STYLES[s]
      if (styleClass) classes.push(styleClass)
    }
    return classes.join(' ')
  }

  let currentClasses = ANSI_RESET

  try {
    while ((match = ansiRegex.exec(text)) !== null) {
      // Add text before this escape code
      if (match.index > lastIndex) {
        const textSegment = text.slice(lastIndex, match.index)
        if (textSegment) {
          segments.push({
            text: textSegment,
            className: currentClasses,
          })
        }
      }

      // Parse the escape code parameters
      const paramsStr = match[1]
      if (!paramsStr) continue
      const params = paramsStr.split(';').map(Number)

      // Reset on 0 or no params
      if (params.length === 0 || params[0] === 0) {
        fg = null
        bg = null
        styles.clear()
        currentClasses = ANSI_RESET
        lastIndex = ansiRegex.lastIndex
        continue
      }

      for (const param of params) {
        if (param >= 30 && param <= 37) {
          // Foreground color
          if (ANSI_COLORS[param]) fg = ANSI_COLORS[param]
        } else if (param >= 40 && param <= 47) {
          // Background color
          if (ANSI_BG_COLORS[param]) bg = ANSI_BG_COLORS[param]
        } else if (param >= 90 && param <= 97) {
          // Bright foreground color
          if (ANSI_COLORS[param]) fg = ANSI_COLORS[param]
        } else if (param in ANSI_STYLES) {
          // Text style — additive (bold + underline can both be active)
          styles.add(param)
        } else if (param === 39) {
          // Default foreground only — leaves bg/styles untouched
          fg = null
        } else if (param === 49) {
          // Default background only — leaves fg/styles untouched
          bg = null
        }
      }

      currentClasses = buildClasses()
      lastIndex = ansiRegex.lastIndex
    }

    // Add remaining text after last escape code
    if (lastIndex < text.length) {
      const textSegment = text.slice(lastIndex)
      if (textSegment) {
        segments.push({
          text: textSegment,
          className: currentClasses,
        })
      }
    }

    return segments
  } catch (error) {
    // Fallback: strip all ANSI codes
    console.warn('ANSI parsing failed, stripping codes:', error)
    return [
      {
        text: stripAnsi(text),
        className: 'text-text-primary',
      },
    ]
  }
}

/**
 * Strip all ANSI escape sequences from text
 * Used as fallback or when colors are not needed
 */
export function stripAnsi(text: string): string {
  return text.replace(new RegExp(String.fromCharCode(0x1b) + '\\[([0-9;]+)m', 'g'), '')
}

/**
 * Convert parsed segments to React nodes
 */
import React from 'react'

export function ansiToReact(text: string): React.ReactNode {
  const segments = parseAnsi(text)

  const nodes: React.ReactNode[] = []

  segments.forEach((segment, index) => {
    const lines = segment.text.split('\n')
    lines.forEach((line, lineIndex) => {
      nodes.push(
        React.createElement(
          'span',
          {
            key: `${index}-${lineIndex}`,
            className: segment.className,
            style: { display: 'inline-block', whiteSpace: 'pre-wrap' },
          },
          line,
        ),
      )
      if (lineIndex < lines.length - 1) {
        nodes.push(React.createElement('br', { key: `${index}-${lineIndex}-br` }))
      }
    })
  })

  return nodes.length === 1 ? nodes[0] : nodes
}
