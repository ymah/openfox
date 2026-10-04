import { Link } from 'wouter'
import { useT } from '../hooks/useT'

/**
 * Shown instead of a spinner or a blank page when what the address points at does
 * not exist (a deleted project, a mistyped link) or cannot be loaded.
 */
export function NotFoundView({ kind }: { kind: 'project' | 'page' }) {
  const t = useT()
  const message =
    kind === 'project'
      ? t({
          en: 'This project could not be found. It may have been deleted, or the server could not load it.',
          fr: 'Ce projet est introuvable. Il a peut-être été supprimé, ou le serveur n’a pas pu le charger.',
        })
      : t({ en: 'This page does not exist.', fr: 'Cette page n’existe pas.' })

  return (
    <div
      className="flex-1 h-full flex flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="not-found"
    >
      <p className="max-w-md text-sm text-text-muted">{message}</p>
      <Link
        href="/"
        className="rounded font-medium transition-colors bg-accent-primary/25 text-text-primary hover:bg-accent-primary/40 px-4 py-2 text-sm"
      >
        {t({ en: 'Back to the home page', fr: 'Retour à l’accueil' })}
      </Link>
    </div>
  )
}
