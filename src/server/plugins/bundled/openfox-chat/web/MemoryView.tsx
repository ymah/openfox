import { useCallback, useEffect, useState } from 'react'
import { Link } from 'wouter'
import { useT } from '@/hooks/useT'
import {
  addMemory,
  clearMemories,
  forgetMemory,
  listMemories,
  parseTags,
  setMemoryEnabled,
  updateMemory,
  type MemoryEntry,
} from './memory-client'

const FIELD =
  'w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary'
const BUTTON =
  'rounded px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-40'

/**
 * Everything the assistants remember about you, shared by every chat project.
 * Nothing is kept out of sight: each memory can be edited or forgotten, memory
 * can be turned off (assistants then neither read nor write it), and it can be
 * wiped in one go.
 */
export function MemoryView({ projectId }: { projectId: string }) {
  const t = useT()
  const [entries, setEntries] = useState<MemoryEntry[] | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newText, setNewText] = useState('')
  const [newTags, setNewTags] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editTags, setEditTags] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await listMemories(projectId)
      setEntries(data.entries)
      setEnabled(data.enabled)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setEntries((current) => current ?? [])
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    run(async () => {
      await addMemory(projectId, newText, parseTags(newTags))
      setNewText('')
      setNewTags('')
    })

  const saveEdit = (id: string) =>
    run(async () => {
      await updateMemory(projectId, id, editText, parseTags(editTags))
      setEditingId(null)
    })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-text-primary">{t({ en: 'Memory', fr: 'Mémoire' })}</h2>
          <Link href={`/p/${projectId}`} className={BUTTON}>
            {t({ en: 'Back', fr: 'Retour' })}
          </Link>
        </div>
        <p className="text-sm text-text-muted mb-4">
          {t({
            en: 'What your assistants remember about you, in every chat project. They read it at the start of a conversation and save durable facts as you talk. Everything is listed here: edit it, or forget it.',
            fr: 'Ce que vos assistants retiennent sur vous, dans tous les projets de chat. Ils la consultent au début d’une conversation et y ajoutent des faits durables au fil des échanges. Tout est listé ici : modifiez-le ou oubliez-le.',
          })}
        </p>

        <label className="mb-6 flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            data-testid="memory-enabled"
            onChange={(e) => void run(() => setMemoryEnabled(projectId, e.target.checked))}
          />
          {t({ en: 'Assistants may use memory', fr: 'Les assistants peuvent utiliser la mémoire' })}
        </label>

        {error && (
          <p className="mb-3 text-sm text-accent-error" data-testid="memory-error">
            {error}
          </p>
        )}

        <div className="mb-6 rounded border border-border bg-bg-secondary p-3">
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t({ en: 'Add a memory', fr: 'Ajouter un souvenir' })}
          </label>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={2}
            maxLength={1000}
            className={FIELD}
            data-testid="memory-new-text"
            placeholder={t({
              en: 'e.g. I live in Lyon and prefer metric units.',
              fr: 'ex. J’habite à Lyon et je préfère le système métrique.',
            })}
          />
          <div className="mt-2 flex gap-2">
            <input
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className={FIELD}
              placeholder={t({
                en: 'tags, comma separated (optional)',
                fr: 'étiquettes, séparées par des virgules (facultatif)',
              })}
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || !newText.trim()}
              data-testid="memory-add"
              className="shrink-0 rounded bg-accent-primary/25 px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-primary/40 disabled:opacity-40"
            >
              {t({ en: 'Add', fr: 'Ajouter' })}
            </button>
          </div>
        </div>

        {entries === null ? (
          <p className="text-sm text-text-muted">{t({ en: 'Loading…', fr: 'Chargement…' })}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-text-muted" data-testid="memory-empty">
            {t({ en: 'Nothing remembered yet.', fr: 'Rien de mémorisé pour le moment.' })}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2" data-testid="memory-list">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded border border-border bg-bg-secondary p-3"
                  data-testid="memory-entry"
                >
                  {editingId === entry.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        className={FIELD}
                        data-testid="memory-edit-text"
                      />
                      <input value={editTags} onChange={(e) => setEditTags(e.target.value)} className={FIELD} />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className={BUTTON}>
                          {t({ en: 'Cancel', fr: 'Annuler' })}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(entry.id)}
                          disabled={busy || !editText.trim()}
                          data-testid="memory-save-edit"
                          className="rounded bg-accent-primary/25 px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-primary/40 disabled:opacity-40"
                        >
                          {t({ en: 'Save', fr: 'Enregistrer' })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-text-primary break-words">{entry.text}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs text-text-muted">
                          {new Date(entry.updatedAt).toLocaleDateString()}
                          {entry.tags.length > 0 && ` · ${entry.tags.map((tag) => `#${tag}`).join(' ')}`}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(entry.id)
                              setEditText(entry.text)
                              setEditTags(entry.tags.join(', '))
                            }}
                            className={BUTTON}
                          >
                            {t({ en: 'Edit', fr: 'Modifier' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => void run(() => forgetMemory(projectId, entry.id))}
                            disabled={busy}
                            data-testid="memory-forget"
                            className={BUTTON}
                          >
                            {t({ en: 'Forget', fr: 'Oublier' })}
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex justify-end">
              {confirmClear ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted">{t({ en: 'Forget everything?', fr: 'Tout oublier ?' })}</span>
                  <button
                    type="button"
                    onClick={() => void run(() => clearMemories(projectId)).then(() => setConfirmClear(false))}
                    disabled={busy}
                    data-testid="memory-clear-confirm"
                    className={`${BUTTON} text-accent-error`}
                  >
                    {t({ en: 'Yes, forget all', fr: 'Oui, tout oublier' })}
                  </button>
                  <button type="button" onClick={() => setConfirmClear(false)} className={BUTTON}>
                    {t({ en: 'Cancel', fr: 'Annuler' })}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  data-testid="memory-clear"
                  className={BUTTON}
                >
                  {t({ en: 'Forget everything', fr: 'Tout oublier' })}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
