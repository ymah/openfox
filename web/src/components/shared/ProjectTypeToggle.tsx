import { useT } from '../../hooks/useT'
import type { ProjectType } from '@shared/types.js'

export type { ProjectType }

interface ProjectTypeToggleProps {
  value: ProjectType
  onChange: (value: ProjectType) => void
}

/**
 * Dev vs GTD choice shown at project creation — persists as the project's
 * `type`, which scopes which agents/workflows/UI chrome the project sees
 * from then on (see web/src/lib/project-modes.ts), and seeds `defaultAgent`
 * so the very first session opens in the right mode.
 */
export function ProjectTypeToggle({ value, onChange }: ProjectTypeToggleProps) {
  const t = useT()

  return (
    <div>
      <div className="flex items-center gap-1 p-0.5 rounded bg-bg-tertiary/50 w-fit">
        <button
          type="button"
          onClick={() => onChange('dev')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            value === 'dev'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          {t({ en: 'Dev', fr: 'Dev' })}
        </button>
        <button
          type="button"
          onClick={() => onChange('gtd')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            value === 'gtd'
              ? 'bg-amber-500/20 text-amber-500'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
          }`}
        >
          {t({ en: 'GTD', fr: 'GTD' })}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        {value === 'gtd'
          ? t({
              en: 'This folder becomes a GTD vault — capture, clarify, dispatch. See docs/GTD.md.',
              fr: 'Ce dossier devient un vault GTD — capture, clarification, dispatch. Voir docs/GTD.md.',
            })
          : t({ en: 'Classic OpenFox coding workflow.', fr: 'Flux de code OpenFox classique.' })}
      </p>
    </div>
  )
}
