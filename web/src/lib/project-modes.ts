import type { ProjectType } from '@shared/types.js'
import { BUNDLED_PLUGIN_MODES } from './bundled-plugin-modes'

/**
 * Registry of project functions ("modes"). A project's persisted `type` scopes
 * which agents/workflows it can select (see category-groups.ts
 * `filterByProjectType`) and which UI chrome it shows (Header, SessionSidebar).
 *
 * Only `dev` lives here. Every other function is declared by the bundled plugin
 * that owns it (`projectModes` in its web entry), so disabling that plugin
 * removes the function whole — its mode, its pages, its agents and its
 * workflows — instead of leaving a half-working project type behind.
 */
export type ProjectModeTone = 'primary' | 'amber' | 'rose'

/**
 * Tailwind needs to see class names verbatim in source, so a mode declares a
 * tone and the mapping lives here rather than being built by interpolation.
 */
const TONE_CLASSES: Record<ProjectModeTone, string> = {
  primary: 'bg-accent-primary/20 text-accent-primary',
  amber: 'bg-amber-500/20 text-amber-500',
  rose: 'bg-rose-500/20 text-rose-500',
}

export interface ProjectModeDef {
  value: ProjectType
  label: { en: string; fr: string }
  description: { en: string; fr: string }
  tone: ProjectModeTone
  showsDevChrome: boolean
  /**
   * A conversational mode: the composer drops the controls that only make sense
   * for an agent working on files (the permission-level selector).
   */
  chatChrome?: boolean
  /** Agent seeded as the project's defaultAgent at creation. */
  defaultAgent?: string
  /** Modes with a dedicated project home instead of the ordinary session list. */
  hasCustomHome?: boolean
}

export const CORE_PROJECT_MODES: ProjectModeDef[] = [
  {
    value: 'dev',
    label: { en: 'Dev', fr: 'Dev' },
    description: { en: 'Classic OpenFox coding workflow.', fr: 'Flux de code OpenFox classique.' },
    tone: 'primary',
    showsDevChrome: true,
  },
]

export const PROJECT_MODES: ProjectModeDef[] = [...CORE_PROJECT_MODES, ...BUNDLED_PLUGIN_MODES]

export const DEFAULT_PROJECT_TYPE: ProjectType = 'dev'

export function modeClassName(mode: ProjectModeDef): string {
  return TONE_CLASSES[mode.tone]
}

/**
 * A project whose mode is not registered — its plugin is disabled or gone. It
 * deliberately does NOT inherit dev's chrome: falling back to dev used to show
 * the git/workspace/terminal chrome on a book project, which is silently wrong.
 */
export const UNKNOWN_PROJECT_MODE: ProjectModeDef & { isUnknown: true } = {
  value: '',
  label: { en: 'Unavailable', fr: 'Indisponible' },
  description: {
    en: 'This project function is not available — its plugin is disabled.',
    fr: 'Cette fonction de projet est indisponible — son plugin est désactivé.',
  },
  tone: 'primary',
  showsDevChrome: false,
  isUnknown: true,
}

export function getProjectMode(type: ProjectType | undefined): ProjectModeDef {
  // No type at all (a project predating project functions) is a dev project.
  if (!type) return CORE_PROJECT_MODES[0]!
  return PROJECT_MODES.find((m) => m.value === type) ?? UNKNOWN_PROJECT_MODE
}

/** True when the project's function exists but its plugin is not providing it. */
export function isUnknownProjectMode(type: ProjectType | undefined): boolean {
  return Boolean(type) && !PROJECT_MODES.some((m) => m.value === type)
}
