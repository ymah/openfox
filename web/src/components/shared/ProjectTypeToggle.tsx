import { useT } from '../../hooks/useT'
import { modeClassName } from '../../lib/project-modes'
import { useProjectModes } from '../../hooks/useProjectModes'
import type { ProjectType } from '@shared/types.js'

export type { ProjectType }

interface ProjectTypeToggleProps {
  value: ProjectType
  onChange: (value: ProjectType) => void
}

/**
 * Project function choice shown at project creation — persists as the
 * project's `type`, which scopes which agents/workflows/UI chrome the
 * project sees from then on (see web/src/lib/project-modes.ts), and seeds
 * `defaultAgent` so the very first session opens in the right mode.
 */
export function ProjectTypeToggle({ value, onChange }: ProjectTypeToggleProps) {
  const t = useT()
  const modes = useProjectModes()
  const activeMode = modes.find((m) => m.value === value) ?? modes[0]!

  return (
    <div>
      <div className="flex items-center gap-1 p-0.5 rounded bg-bg-tertiary/50 w-fit">
        {modes.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              value === mode.value
                ? modeClassName(mode)
                : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
            }`}
          >
            {t(mode.label)}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-text-muted">{t(activeMode.description)}</p>
    </div>
  )
}
