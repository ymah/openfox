/** The saved list of favourite models ("providerId/modelId"); anything else in the setting is ignored. */
export function parseFavoriteKeys(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
  } catch {
    return []
  }
}
