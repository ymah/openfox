import { useT } from '../../hooks/useT'
import { ARTIFACT_SANDBOX, buildArtifactDocument, type ArtifactLanguage } from '../../lib/artifact'

/** A sandboxed, network-less frame showing model-generated HTML or SVG. */
export function ArtifactPreview({ language, code }: { language: ArtifactLanguage; code: string }) {
  const t = useT()
  return (
    <iframe
      title={t({ en: 'Preview', fr: 'Aperçu' })}
      sandbox={ARTIFACT_SANDBOX}
      srcDoc={buildArtifactDocument(language, code)}
      referrerPolicy="no-referrer"
      className="w-full h-80 min-h-40 resize-y rounded border border-border bg-white"
      data-testid="artifact-preview"
    />
  )
}
