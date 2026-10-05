import { Component, type ReactNode } from 'react'
import { Link } from 'wouter'
import { useT } from '../../hooks/useT'

function ErrorFallback({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useT()
  const buttonClass =
    'rounded font-medium transition-colors bg-accent-primary/25 text-text-primary hover:bg-accent-primary/40 px-4 py-2 text-sm'
  return (
    <div
      className="flex-1 h-full flex flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
      data-testid="page-error"
    >
      <p className="max-w-md text-sm text-text-muted">
        {t({
          en: 'Something went wrong while displaying this page.',
          fr: 'Une erreur est survenue pendant l’affichage de cette page.',
        })}
      </p>
      <p className="max-w-md break-words text-xs text-text-muted/70">{error.message}</p>
      <div className="flex gap-3">
        <button type="button" className={buttonClass} onClick={onRetry}>
          {t({ en: 'Try again', fr: 'Réessayer' })}
        </button>
        <Link href="/" className={buttonClass}>
          {t({ en: 'Back to the home page', fr: 'Retour à l’accueil' })}
        </Link>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
  /** When this changes (e.g. the route), a shown error is cleared and the children render again. */
  resetKey?: string
}

interface State {
  error: Error | null
  resetKey: string | undefined
}

/**
 * A render error inside a page — a plugin's editor, a project home — must not unmount
 * the whole application into a blank page: the rest (sidebar, navigation) stays usable
 * and the person can retry or go home.
 */
export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  override componentDidCatch(error: unknown) {
    console.error('Page render error:', error)
  }

  override render() {
    const { error } = this.state
    if (error) return <ErrorFallback error={error} onRetry={() => this.setState({ error: null })} />
    return this.props.children
  }
}
