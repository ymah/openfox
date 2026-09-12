export type CodexType = 'characters' | 'locations' | 'lore' | 'items' | 'subplots'

export interface CodexEntry {
  type: CodexType
  slug: string
  title: string
  tags: string[]
  facts: Record<string, unknown>
  body: string
}

export interface SceneSummary {
  slug: string
  path: string
  title?: string
  pov?: string
  status?: string
  summary?: string
}

export interface ChapterSummary {
  slug: string
  title: string
  scenes: SceneSummary[]
}

export interface ActSummary {
  slug: string
  title: string
  chapters: ChapterSummary[]
}

export const CODEX_TYPE_LABELS: Record<CodexType, { en: string; fr: string }> = {
  characters: { en: 'Characters', fr: 'Personnages' },
  locations: { en: 'Locations', fr: 'Lieux' },
  lore: { en: 'Lore', fr: 'Lore' },
  items: { en: 'Items', fr: 'Objets' },
  subplots: { en: 'Subplots', fr: 'Intrigues secondaires' },
}

export const CODEX_TYPES: CodexType[] = ['characters', 'locations', 'lore', 'items', 'subplots']
