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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending (debounced) edit and the path it belongs to — flushed on path
  // change / unmount so the last keystrokes are never lost, and never written
  // to a different scene than the one they were typed in.
  const pendingSave = useRef<{ path: string; frontmatter: Record<string, unknown>; body: string } | null>(null)
  const loaded = useRef(false)

  const save = useCallback(
    async (targetPath: string, nextFrontmatter: Record<string, unknown>, nextBody: string) => {
      setSaveState('pending')
      try {
        const res = await authFetch(
          `/api/projects/${projectId}/manuscript/scene?path=${encodeURIComponent(targetPath)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frontmatter: nextFrontmatter, body: nextBody }),
          },
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setSaveState('saved')
      } catch (error) {
        console.error('Scene save failed:', error)
        setSaveState('error')
      }
    },
    [projectId],
  )

  const flushPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const pending = pendingSave.current
    pendingSave.current = null
    if (pending) void save(pending.path, pending.frontmatter, pending.body)
  }, [save])

  useEffect(() => {
    if (!path) return
    // Leaving a scene: write what is still debounced for the previous one.
    flushPendingSave()
    loaded.current = false
    setLoading(true)
    setLoadError(null)
    setSaveState('idle')
    // Latest-wins: a slow response for scene A must not land after B was
    // opened — the editor would show A's text under B and autosave it there.
    let cancelled = false
    authFetch(`/api/projects/${projectId}/manuscript/scene?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setFrontmatter(data.frontmatter ?? {})
        setBody(data.body ?? '')
        // Autosave is only armed once the real content is in the editor —
        // arming it after a failed load would overwrite the file with ''.
        loaded.current = true
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Scene load failed:', error)
        setLoadError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, path, flushPendingSave])

  // Unmount: flush the debounced edit instead of dropping it.
  useEffect(() => flushPendingSave, [flushPendingSave])

  const scheduleSave = useCallback(
    (nextFrontmatter: Record<string, unknown>, nextBody: string) => {
      if (!loaded.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      pendingSave.current = { path, frontmatter: nextFrontmatter, body: nextBody }
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null
        const pending = pendingSave.current
        pendingSave.current = null
        if (pending) void save(pending.path, pending.frontmatter, pending.body)
      }, AUTOSAVE_DELAY_MS)
    },
    [save, path],
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
        ) : loadError ? (
          <p className="text-sm text-error">
            {t(
              { en: 'Could not load this scene: {{error}}', fr: 'Impossible de charger cette scène : {{error}}' },
              { error: loadError },
            )}
          </p>
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
                    : saveState === 'error'
                      ? t({ en: 'Save failed', fr: 'Échec de l’enregistrement' })
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
