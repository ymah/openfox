import { getDatabase } from './index.js'

/**
 * Settings a single conversation can override: how the model samples and an
 * optional persona (free-form system prompt). They sit above the per-model
 * settings, which sit above the built-in model profile.
 */
export interface SessionChatSettings {
  temperature?: number
  topP?: number
  maxTokens?: number
  /** Free-form persona / system prompt appended to the session's instructions. */
  systemPrompt?: string
}

export const MAX_SYSTEM_PROMPT_LENGTH = 8000

/**
 * Validate an untrusted settings object. Returns the cleaned settings, or an
 * error message naming the first offending field. Unknown keys are dropped, and
 * a null/empty value removes that override.
 */
export function parseSessionChatSettings(
  input: unknown,
): { ok: true; settings: SessionChatSettings } | { ok: false; error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'settings must be an object' }
  }
  const raw = input as Record<string, unknown>
  const settings: SessionChatSettings = {}

  const num = (key: 'temperature' | 'topP' | 'maxTokens', min: number, max: number, integer = false) => {
    const value = raw[key]
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return `${key} must be a number between ${min} and ${max}`
    }
    if (integer && !Number.isInteger(value)) return `${key} must be an integer`
    settings[key] = value
    return undefined
  }
  const error = num('temperature', 0, 2) ?? num('topP', 0, 1) ?? num('maxTokens', 1, 1_000_000, true)
  if (error) return { ok: false, error }

  const prompt = raw['systemPrompt']
  if (prompt !== undefined && prompt !== null) {
    if (typeof prompt !== 'string') return { ok: false, error: 'systemPrompt must be a string' }
    if (prompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      return { ok: false, error: `systemPrompt is limited to ${MAX_SYSTEM_PROMPT_LENGTH} characters` }
    }
    if (prompt.trim()) settings.systemPrompt = prompt.trim()
  }
  return { ok: true, settings }
}

export function getSessionChatSettings(sessionId: string): SessionChatSettings {
  const row = getDatabase()
    .prepare('SELECT settings FROM session_chat_settings WHERE session_id = ?')
    .get(sessionId) as { settings: string } | undefined
  if (!row) return {}
  try {
    const parsed = parseSessionChatSettings(JSON.parse(row.settings))
    return parsed.ok ? parsed.settings : {}
  } catch {
    return {}
  }
}

/** Replace a session's settings. An empty object removes the row. */
export function setSessionChatSettings(sessionId: string, settings: SessionChatSettings): void {
  const db = getDatabase()
  if (Object.keys(settings).length === 0) {
    db.prepare('DELETE FROM session_chat_settings WHERE session_id = ?').run(sessionId)
    return
  }
  db.prepare(
    `INSERT INTO session_chat_settings (session_id, settings, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
  ).run(sessionId, JSON.stringify(settings), new Date().toISOString())
}
