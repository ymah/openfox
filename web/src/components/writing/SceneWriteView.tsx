import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation, useSearch } from 'wouter'
import { ScrollArea } from '../shared/ScrollArea'
import { Button } from '../shared/Button'
import { Input } from '../shared/Input'
import { useT } from '../../hooks/useT'
import { authFetch } from '../../lib/api'
import { useSessionStore } from '../../stores/session'

interface SceneWriteViewProps {
  projectId: string
}

const AUTOSAVE_DELAY_MS = 1200

export function SceneWriteView({ projectId }: SceneWriteViewProps) {
  const t = useT()
  const [, navigate] = useLocation()
  const search = useSearch()
  const path = new URLSearchParams(search).get('path') ?? ''
  const createSession = useSessionStore((state) => state.createSession)

  const [frontmatter, setFrontmatter] = useState<Record<string, unknown>>({})
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!path) return
    loaded.current = false
    setLoading(true)
    authFetch(`/api/projects/${projectId}/manuscript/scene?path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data) => {
        setFrontmatter(data.frontmatter ?? {})
        setBody(data.body ?? '')
      })
      .finally(() => {
        loaded.current = true
        setLoading(false)
      })
  }, [projectId, path])

  const save = useCallback(
    async (nextFrontmatter: Record<string, unknown>, nextBody: string) => {
      setSaveState('pending')
      await authFetch(`/api/projects/${projectId}/manuscript/scene?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontmatter: nextFrontmatter, body: nextBody }),
      })
      setSaveState('saved')
    },
    [projectId, path],
  )

  const scheduleSave = useCallback(
    (nextFrontmatter: Record<string, unknown>, nextBody: string) => {
      if (!loaded.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => save(nextFrontmatter, nextBody), AUTOSAVE_DELAY_MS)
    },
    [save],
  )

  const updateFrontmatter = (key: string, value: string) => {
    const next = { ...frontmatter, [key]: value }
    setFrontmatter(next)
    scheduleSave(next, body)
  }

  const updateBody = (value: string) => {
    setBody(value)
    scheduleSave(frontmatter, value)
  }

  const handleChatAboutScene = async () => {
    const session = await createSession(projectId, t({ en: 'Scene chat', fr: 'Discussion de scène' }))
    if (!session) return
    // Most scenes have no subtitle — fall back to a path-only phrasing
    // rather than printing the same path twice ("scene "<path>" (<path>)").
    const title = typeof frontmatter['title'] === 'string' ? frontmatter['title'] : undefined
    const draft = title
      ? t(
          {
            en: `Can you help me with the scene "{{title}}" ({{path}})?`,
            fr: `Peux-tu m'aider avec la scène « {{title}} » ({{path}}) ?`,
          },
          { title, path },
        )
      : t({ en: 'Can you help me with the scene {{path}}?', fr: `Peux-tu m'aider avec la scène {{path}} ?` }, { path })
    try {
      localStorage.setItem(`openfox:draft:${session.id}`, draft)
    } catch {
      // ignore (private browsing / storage disabled)
    }
    navigate(`/p/${projectId}/s/${session.id}`)
  }

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        {t({ en: 'No scene selected', fr: 'Aucune scène sélectionnée' })}
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="max-w-3xl mx-auto p-6">
        {loading ? (
          <p className="text-sm text-text-muted">{t({ en: 'Loading…', fr: 'Chargement…' })}</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <Input
                value={typeof frontmatter['title'] === 'string' ? frontmatter['title'] : ''}
                onChange={(e) => updateFrontmatter('title', e.target.value)}
                placeholder={t({ en: 'Scene subtitle…', fr: 'Sous-titre de la scène…' })}
                className="text-lg font-semibold flex-1 mr-3"
              />
              <Button size="sm" onClick={handleChatAboutScene}>
                {t({ en: 'Chat about this scene', fr: 'Discuter de cette scène' })}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <Input
                value={typeof frontmatter['pov'] === 'string' ? frontmatter['pov'] : ''}
                onChange={(e) => updateFrontmatter('pov', e.target.value)}
                placeholder={t({ en: 'POV', fr: 'POV' })}
                className="w-40 text-xs py-1"
              />
              <select
                value={typeof frontmatter['status'] === 'string' ? frontmatter['status'] : 'draft'}
                onChange={(e) => updateFrontmatter('status', e.target.value)}
                className="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text-primary"
              >
                <option value="draft">{t({ en: 'Draft', fr: 'Brouillon' })}</option>
                <option value="revised">{t({ en: 'Revised', fr: 'Révisée' })}</option>
                <option value="final">{t({ en: 'Final', fr: 'Finale' })}</option>
              </select>
              <span className="text-xs text-text-muted self-center">
                {saveState === 'pending'
                  ? t({ en: 'Saving…', fr: 'Enregistrement…' })
                  : saveState === 'saved'
                    ? t({ en: 'Saved', fr: 'Enregistré' })
                    : ''}
              </span>
            </div>

            <Input
              value={typeof frontmatter['summary'] === 'string' ? frontmatter['summary'] : ''}
              onChange={(e) => updateFrontmatter('summary', e.target.value)}
              placeholder={t({ en: 'One-line summary', fr: 'Résumé en une phrase' })}
              className="w-full text-sm mb-4"
            />

            <textarea
              value={body}
              onChange={(e) => updateBody(e.target.value)}
              placeholder={t({ en: 'Write the scene…', fr: 'Écrivez la scène…' })}
              rows={28}
              className="w-full bg-bg-tertiary border border-border rounded px-4 py-3 text-sm leading-relaxed text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-serif"
            />
          </>
        )}
      </div>
    </ScrollArea>
  )
}
