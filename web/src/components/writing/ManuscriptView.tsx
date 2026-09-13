import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation } from 'wouter'
import { ScrollArea } from '../shared/ScrollArea'
import { Button } from '../shared/Button'
import { Input } from '../shared/Input'
import { useT } from '../../hooks/useT'
import { authFetch } from '../../lib/api'
import { slugify, nextNumberedSlug, findSlugByTitle } from './utils'
import type { ActSummary } from './types'

interface ManuscriptViewProps {
  projectId: string
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-text-muted/20 text-text-muted',
  revised: 'bg-amber-500/20 text-amber-500',
  final: 'bg-accent-success/20 text-accent-success',
}

export function ManuscriptView({ projectId }: ManuscriptViewProps) {
  const t = useT()
  const [, navigate] = useLocation()
  const [acts, setActs] = useState<ActSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewScene, setShowNewScene] = useState(false)
  const [actTitle, setActTitle] = useState('')
  const [chapterTitle, setChapterTitle] = useState('')
  const [sceneSummary, setSceneSummary] = useState('')
  const [creating, setCreating] = useState(false)

  const [error, setError] = useState<string | null>(null)
  // Latest-wins across project switches: a late response for the previous
  // project must not render its acts under the new one.
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/manuscript`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (seq !== loadSeq.current) return
      setActs(Array.isArray(data.acts) ? data.acts : [])
      setError(null)
    } catch (err) {
      if (seq !== loadSeq.current) return
      console.error('Manuscript load failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const handleCreateScene = async () => {
    if (!actTitle.trim() || !chapterTitle.trim()) return
    if (!slugify(actTitle) || !slugify(chapterTitle)) {
      setError(
        t({
          en: 'Act and chapter titles must contain at least one letter or digit',
          fr: 'Les titres d’acte et de chapitre doivent contenir au moins une lettre ou un chiffre',
        }),
      )
      return
    }
    setCreating(true)
    try {
      // Reuse an existing act/chapter when the title matches one already on
      // disk, instead of always minting a new numbered folder — otherwise
      // every "+ New scene" click fragments the manuscript into duplicate
      // acts/chapters, and scenes (always unnumbered "01-scene" before this
      // fix) would silently overwrite each other within the same chapter.
      const actSlugs = acts.map((a) => a.slug)
      const actSlug = findSlugByTitle(actSlugs, actTitle) ?? nextNumberedSlug(actSlugs, slugify(actTitle))
      const existingAct = acts.find((a) => a.slug === actSlug)

      const chapterSlugs = existingAct?.chapters.map((c) => c.slug) ?? []
      const chapterSlug =
        findSlugByTitle(chapterSlugs, chapterTitle) ?? nextNumberedSlug(chapterSlugs, slugify(chapterTitle))
      const existingChapter = existingAct?.chapters.find((c) => c.slug === chapterSlug)

      const sceneSlugs = existingChapter?.scenes.map((s) => s.slug) ?? []
      const sceneSlug = nextNumberedSlug(sceneSlugs, 'scene')

      const path = `manuscript/${actSlug}/${chapterSlug}/${sceneSlug}.md`
      const res = await authFetch(`/api/projects/${projectId}/manuscript/scene?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontmatter: { status: 'draft', summary: sceneSummary.trim() },
          body: '',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setShowNewScene(false)
      setActTitle('')
      setChapterTitle('')
      setSceneSummary('')
      setError(null)
      await load()
      // Only navigate to a scene that actually exists on disk
      navigate(`/p/${projectId}/write?path=${encodeURIComponent(path)}`)
    } catch (err) {
      console.error('Scene creation failed:', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <ScrollArea className="flex-1 p-6">
      <div className="max-w-3xl mx-auto">
        {error && <p className="mb-3 text-xs text-error">{error}</p>}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">{t({ en: 'Manuscript', fr: 'Manuscrit' })}</h2>
          <Button variant="primary" size="sm" onClick={() => setShowNewScene((v) => !v)}>
            {t({ en: '+ New scene', fr: '+ Nouvelle scène' })}
          </Button>
        </div>

        {showNewScene && (
          <div className="mb-6 p-4 rounded-lg border border-border bg-bg-secondary space-y-2">
            <p className="text-xs text-text-muted">
              {t({
                en: 'Adding a scene to a new act/chapter creates them automatically.',
                fr: 'Ajouter une scène à un acte/chapitre nouveau les crée automatiquement.',
              })}
            </p>
            <Input
              value={actTitle}
              onChange={(e) => setActTitle(e.target.value)}
              placeholder={t({ en: 'Act title', fr: "Titre de l'acte" })}
              className="w-full text-sm"
            />
            <Input
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder={t({ en: 'Chapter title', fr: 'Titre du chapitre' })}
              className="w-full text-sm"
            />
            <Input
              value={sceneSummary}
              onChange={(e) => setSceneSummary(e.target.value)}
              placeholder={t({ en: 'One-line scene summary', fr: 'Résumé de la scène en une phrase' })}
              className="w-full text-sm"
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleCreateScene} disabled={creating}>
                {t({ en: 'Create', fr: 'Créer' })}
              </Button>
              <Button size="sm" onClick={() => setShowNewScene(false)}>
                {t({ en: 'Cancel', fr: 'Annuler' })}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-text-muted">{t({ en: 'Loading…', fr: 'Chargement…' })}</p>
        ) : acts.length === 0 ? (
          <p className="text-sm text-text-muted">
            {t({
              en: 'No acts yet — create your first scene above.',
              fr: "Aucun acte pour l'instant — créez votre première scène ci-dessus.",
            })}
          </p>
        ) : (
          <div className="space-y-6">
            {acts.map((act) => (
              <div key={act.slug}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-2">{act.title}</h3>
                <div className="space-y-4 pl-3 border-l border-border">
                  {act.chapters.map((chapter) => (
                    <div key={chapter.slug}>
                      <h4 className="text-sm font-medium text-text-primary mb-1.5">{chapter.title}</h4>
                      <div className="space-y-1.5">
                        {chapter.scenes.map((scene) => (
                          <button
                            key={scene.slug}
                            type="button"
                            onClick={() => navigate(`/p/${projectId}/write?path=${encodeURIComponent(scene.path)}`)}
                            className="w-full text-left p-2.5 rounded bg-bg-secondary border border-border hover:bg-bg-tertiary transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-text-primary truncate">
                                {scene.title ?? t({ en: 'Untitled scene', fr: 'Scène sans titre' })}
                              </span>
                              {scene.status && (
                                <span
                                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                                    STATUS_COLOR[scene.status] ?? 'bg-text-muted/20 text-text-muted'
                                  }`}
                                >
                                  {scene.status}
                                </span>
                              )}
                            </div>
                            {scene.summary && (
                              <p className="text-xs text-text-muted truncate mt-0.5">{scene.summary}</p>
                            )}
                            {scene.pov && (
                              <p className="text-xs text-text-muted mt-0.5">
                                {t({ en: 'POV: {{pov}}', fr: 'POV : {{pov}}' }, { pov: scene.pov })}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
