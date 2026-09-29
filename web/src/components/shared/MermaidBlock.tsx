import { useEffect, useState } from 'react'
import { prefersDarkSurface } from '../../lib/artifact'
import { useT } from '../../hooks/useT'

let counter = 0

/**
 * Renders a ```mermaid block as a diagram. Mermaid is large, so it is loaded on
 * first use and only when a diagram actually appears. `securityLevel: 'strict'`
 * makes it sanitise the diagram source, since the text comes from a model. On a
 * syntax error the source is shown through `fallback` instead of breaking the
 * message.
 */
export function MermaidBlock({ code, fallback }: { code: string; fallback: React.ReactNode }) {
  const t = useT()
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${++counter}`
    setFailed(false)
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: prefersDarkSurface() ? 'dark' : 'default',
        })
        const result = await mermaid.render(id, code)
        if (!cancelled) setSvg(result.svg)
      } catch {
        if (!cancelled) {
          setSvg(null)
          setFailed(true)
        }
      } finally {
        // On a syntax error mermaid leaves its error graphic in <body>.
        document.getElementById(`d${id}`)?.remove()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (failed) {
    return (
      <div>
        <p className="text-xs text-text-muted mb-1">
          {t({ en: 'This diagram could not be rendered.', fr: 'Ce diagramme n’a pas pu être affiché.' })}
        </p>
        {fallback}
      </div>
    )
  }
  if (svg === null)
    return (
      <div className="my-1.5 text-xs text-text-muted">{t({ en: 'Rendering diagram…', fr: 'Rendu du diagramme…' })}</div>
    )

  return (
    <div
      className="my-1.5 overflow-x-auto rounded bg-bg-secondary p-3 flex justify-center"
      data-testid="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
