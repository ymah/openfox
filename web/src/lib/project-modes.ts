import type { ProjectType } from '@shared/types.js'

/**
 * Single registry of project functions ("modes"). A project's persisted
 * `type` scopes which agents/workflows it can select (see category-groups.ts
 * `filterByProjectType`) and which UI chrome it shows (Header, SessionSidebar).
 * Adding a future function: extend `ProjectType` in shared/types.ts, give it
 * default agents/workflows tagged with a matching `category`, and add an
 * entry here.
 */
export interface ProjectModeDef {
  value: ProjectType
  label: { en: string; fr: string }
  description: { en: string; fr: string }
  // Full literal Tailwind classes (not built via string interpolation — the
  // JIT compiler only picks up classes it can see verbatim in source).
  activeTabClassName: string
  showsDevChrome: boolean
  // Agent seeded as the project's defaultAgent at creation, and used to
  // route a project's home screen to a mode-specific UI (see App.tsx). Modes
  // that just reuse the ordinary session/chat screen (dev, gtd) leave this
  // unset for the home-screen check but still seed a defaultAgent below.
  defaultAgent?: string
  // Modes with a dedicated project home screen (Codex/Manuscrit for writing)
  // instead of the ordinary session list / EmptyProjectView.
  hasCustomHome?: boolean
}

export const PROJECT_MODES: ProjectModeDef[] = [
  {
    value: 'dev',
    label: { en: 'Dev', fr: 'Dev' },
    description: { en: 'Classic OpenFox coding workflow.', fr: 'Flux de code OpenFox classique.' },
    activeTabClassName: 'bg-accent-primary/20 text-accent-primary',
    showsDevChrome: true,
  },
  {
    value: 'gtd',
    label: { en: 'GTD', fr: 'GTD' },
    description: {
      en: 'This folder becomes a GTD vault — capture, clarify, dispatch. See docs/GTD.md.',
      fr: 'Ce dossier devient un vault GTD — capture, clarification, dispatch. Voir docs/GTD.md.',
    },
    activeTabClassName: 'bg-amber-500/20 text-amber-500',
    showsDevChrome: false,
    defaultAgent: 'gtd-secretary',
  },
  {
    value: 'writing',
    label: { en: 'Writing', fr: 'Écriture' },
    description: {
      en: 'Novel/book vault — Codex, manuscript, AI writing chat.',
      fr: 'Vault roman/livre — Codex, manuscrit, chat IA d’écriture.',
    },
    activeTabClassName: 'bg-rose-500/20 text-rose-500',
    showsDevChrome: false,
    defaultAgent: 'writing-secretary',
    hasCustomHome: true,
  },
]

export const DEFAULT_PROJECT_TYPE: ProjectType = 'dev'

export function getProjectMode(type: ProjectType | undefined): ProjectModeDef {
  return PROJECT_MODES.find((m) => m.value === type) ?? PROJECT_MODES[0]!
}
