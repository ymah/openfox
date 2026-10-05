import type { UserThemePreset } from './theme'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Presets saved in storage or on the server may have been edited by hand or written
 * by another version; anything that is not a well-formed preset is dropped rather
 * than handed to code that expects `.find` on an array.
 */
export function parseUserPresets(raw: string | null | undefined): UserThemePreset[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is UserThemePreset =>
        isRecord(p) && typeof p['id'] === 'string' && typeof p['name'] === 'string' && isRecord(p['tokens']),
    )
  } catch {
    return []
  }
}

export function parseSystemThemePrefs(
  raw: string | null | undefined,
  fallback: { darkPreset: string; lightPreset: string },
): { darkPreset: string; lightPreset: string } {
  if (!raw) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && typeof parsed['darkPreset'] === 'string' && typeof parsed['lightPreset'] === 'string') {
      return { darkPreset: parsed['darkPreset'], lightPreset: parsed['lightPreset'] }
    }
  } catch {
    // fall through
  }
  return fallback
}
