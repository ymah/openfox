import { useEffect, useState, useRef, useCallback } from 'react'
import { useLocation, useSearch } from 'wouter'
import { ScrollArea } from '@/components/shared/ScrollArea'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { useT } from '@/hooks/useT'
import { getScene, saveScene } from './vault-client'
import { PluginRpcError } from '@/lib/plugin-actions'
import { useSessionStore } from '@/stores/session'

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
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saved' | 'error' | 'conflict'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pending (debounced) edit and the path it belongs to — flushed on path
  // change / unmount so the last keystrokes are never lost, and never written
  // to a different scene than the one they were typed in.
  const pendingSave = useRef<{ path: string; frontmatter: Record<string, unknown>; body: string } | null>(null)
  const loaded = useRef(false)
  // The version of each scene as last read or written. Sent with every save so a scene
  // an agent (or another tab) changed in between is not silently overwritten.
  const versions = useRef(new Map<string, number | null | undefined>())
  // While a conflict is unresolved, autosave stays off: it would only be refused again.
  const conflicted = useRef(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  // Saves run one after the other: two in flight could reach the server out of
  // order and leave the older text on disk.
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const save = useCallback(
    (targetPath: string, nextFrontmatter: Record<string, unknown>, nextBody: string): Promise<void> => {
      if (conflicted.current) return Promise.resolve()
      setSaveState('pending')
      const run = async () => {
        if (conflicted.current) return
        try {
          const result = await saveScene(
            projectId,
            targetPath,
            nextFrontmatter,
            nextBody,
            versions.current.get(targetPath),
          )
          versions.current.set(targetPath, result.mtime)
          setSaveState('saved')
        } catch (error) {
          if (error instanceof PluginRpcError && error.code === 'conflict') {
            conflicted.current = true
            setSaveState('conflict')
            return
          }
          console.error('Scene save failed:', error)
          setSaveState('error')
        }
      }
      saveChain.current = saveChain.current.then(run)
      return saveChain.current
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
    conflicted.current = false
    setLoading(true)
    setLoadError(null)
    setSaveState('idle')
    // Latest-wins: a slow response for scene A must not land after B was
    // opened — the editor would show A's text under B and autosave it there.
    let cancelled = false
    getScene(projectId, path)
      .then((data) => {
        if (cancelled) return
        versions.current.set(path, data.mtime)
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
  }, [projectId, path, flushPendingSave, reloadNonce])

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

  /** The scene changed elsewhere: drop my edits and show what is on disk now. */
  const loadChangedScene = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    pendingSave.current = null
    setReloadNonce((n) => n + 1)
  }

  /** The scene changed elsewhere: keep what is in the editor and overwrite the file. */
  const keepMyVersion = async () => {
    conflicted.current = false
    versions.current.set(path, undefined)
    setSaveState('pending')
    try {
      const result = await saveScene(projectId, path, frontmatter, body)
      versions.current.set(path, result.mtime)
      setSaveState('saved')
    } catch (error) {
      console.error('Scene save failed:', error)
      setSaveState('error')
    }
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
            {saveState === 'conflict' && (
              <div
                role="alert"
                data-testid="scene-conflict"
                className="mb-4 rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-text-primary"
              >
                <p className="mb-2">
                  {t({
                    en: 'This scene was changed elsewhere (an agent or another tab) while you were editing. Your latest edits are not saved.',
                    fr: 'Cette scène a été modifiée ailleurs (un agent ou un autre onglet) pendant votre édition. Vos dernières modifications ne sont pas enregistrées.',
                  })}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={loadChangedScene}>
                    {t({ en: 'Load the changed version', fr: 'Charger la version modifiée' })}
                  </Button>
                  <Button size="sm" onClick={keepMyVersion}>
                    {t({ en: 'Keep my version', fr: 'Garder ma version' })}
                  </Button>
                </div>
              </div>
            )}
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
                      : saveState === 'conflict'
                        ? t({ en: 'Not saved — changed elsewhere', fr: 'Non enregistré — modifié ailleurs' })
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
