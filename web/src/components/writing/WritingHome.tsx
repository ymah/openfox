import { Link } from 'wouter'
import { useT } from '../../hooks/useT'
import { useCurrentProject } from '../../hooks/useCurrentProject'

interface WritingHomeProps {
  projectId: string
}

/** Project home for a `writing`-mode project — Codex/Manuscrit instead of a session list. */
export function WritingHome({ projectId }: WritingHomeProps) {
  const t = useT()
  const project = useCurrentProject()

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md w-full">
        <h2 className="text-xl font-semibold text-text-primary mb-6">
          {project?.name ?? t({ en: 'Book', fr: 'Livre' })}
        </h2>
        <div className="flex flex-col gap-3">
          <Link
            href={`/p/${projectId}/manuscript`}
            className="block w-full rounded font-medium transition-colors bg-accent-primary/25 text-text-primary hover:bg-accent-primary/40 px-3 py-2.5"
          >
            {t({ en: 'Manuscript', fr: 'Manuscrit' })}
          </Link>
          <Link
            href={`/p/${projectId}/codex`}
            className="block w-full rounded font-medium transition-colors bg-bg-tertiary text-text-primary hover:bg-border px-3 py-2.5"
          >
            {t({ en: 'Codex', fr: 'Codex' })}
          </Link>
          <p className="text-sm text-text-muted mt-2">
            {t({
              en: 'Or open an existing scene chat from the sidebar',
              fr: 'Ou ouvrez une discussion de scène existante depuis la barre latérale',
            })}
          </p>
        </div>
      </div>
    </div>
  )
}
