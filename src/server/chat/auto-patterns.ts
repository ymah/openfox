export interface RetryPatternConfig {
  field: 'thinking' | 'content' | 'both'
  pattern: string
  action: 'retry'
  active: boolean
}

export interface RetryPatternMatch {
  pattern: string
  field: string
  matchedContent: string
}

/**
 * Out-of-the-box protection against models (local ones especially) that
 * fall back to printing tool calls as raw XML-ish tags instead of using the
 * structured tool-calling API — retried instead of leaking into the chat.
 * This is the actual default: it must reach both `SETTINGS_DEFAULTS` (what
 * the settings API reports) and the orchestrator's no-setting-saved-yet
 * fallback, not just the legacy `llm.disableXmlProtection` migration path.
 */
export const DEFAULT_RETRY_PATTERNS: RetryPatternConfig[] = [
  { field: 'both', pattern: '<(tool_call|function=|/tool_call|parameter=)', action: 'retry', active: true },
]

const VALID_FIELDS = ['thinking', 'content', 'both'] as const

export function matchRetryPatterns(
  content: string,
  thinking: string | undefined,
  patterns: RetryPatternConfig[],
): RetryPatternMatch[] {
  const matches: RetryPatternMatch[] = []

  for (const config of patterns) {
    if (!config.active) continue

    let regex: RegExp
    try {
      regex = new RegExp(config.pattern)
    } catch {
      continue
    }

    const testContent = config.field === 'thinking' ? false : regex.test(content)
    const testThinking = config.field === 'content' ? false : thinking !== undefined && regex.test(thinking)

    if (testContent) {
      matches.push({ pattern: config.pattern, field: config.field, matchedContent: content })
    }
    if (testThinking) {
      matches.push({ pattern: config.pattern, field: config.field, matchedContent: thinking! })
    }
  }

  return matches
}

export function validateRetryPatterns(patterns: RetryPatternConfig[]): string[] {
  const errors: string[] = []

  for (const [i, p] of patterns.entries()) {
    if (!VALID_FIELDS.includes(p.field as (typeof VALID_FIELDS)[number])) {
      errors.push(`Pattern ${i}: Invalid field "${p.field}". Must be "thinking", "content", or "both".`)
    }
    if (!p.pattern || p.pattern.trim() === '') {
      errors.push(`Pattern ${i}: Pattern is required.`)
    } else {
      try {
        new RegExp(p.pattern)
      } catch {
        errors.push(`Pattern ${i}: Invalid regex "${p.pattern}".`)
      }
    }
  }

  return errors
}
