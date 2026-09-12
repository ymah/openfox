import { useEffect, useState, useCallback } from 'react'
import { ScrollArea } from '../shared/ScrollArea'
import { Button } from '../shared/Button'
import { Input } from '../shared/Input'
import { useT } from '../../hooks/useT'
import { authFetch } from '../../lib/api'
import { slugify } from './utils'
import { CODEX_TYPES, CODEX_TYPE_LABELS, type CodexEntry, type CodexType } from './types'

interface CodexViewProps {
  projectId: string
}

export function CodexView({ projectId }: CodexViewProps) {
  const t = useT()
  const [entries, setEntries] = useState<CodexEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ type: CodexType; slug: string } | null>(null)
  const [draft, setDraft] = useState<CodexEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [creatingType, setCreatingType] = useState<CodexType | null>(null)
  const [newTitle, setNewTitle] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/codex`)
      const data = await res.json()
      setEntries(data.entries ?? [])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      return
    }
    const existing = entries.find((e) => e.type === selected.type && e.slug === selected.slug)
    setDraft(existing ? { ...existing } : null)
  }, [selected, entries])

  const handleSave = async () => {
    if (!draft || !selected) return
    setSaving(true)
    try {
      const res = await authFetch(`/api/projects/${projectId}/codex/${selected.type}/${selected.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, tags: draft.tags, facts: draft.facts, body: draft.body }),
      })
      const saved = (await res.json()) as CodexEntry
      setEntries((prev) => {
        const others = prev.filter((e) => !(e.type === selected.type && e.slug === selected.slug))
        return [...others, saved]
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async (type: CodexType) => {
    const title = newTitle.trim()
    if (!title) return
    const slug = slugify(title)
    setCreatingType(null)
    setNewTitle('')
    // A title that slugifies to an already-existing entry must not blank it
    // out with an empty PUT — just open the existing entry instead.
    const existing = entries.find((e) => e.type === type && e.slug === slug)
    if (!existing) {
      await authFetch(`/api/projects/${projectId}/codex/${type}/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, tags: [], facts: {}, body: '' }),
      })
      await load()
    }
    setSelected({ type, slug })
  }

  const handleFactChange = (key: string, value: string) => {
    if (!draft) return
    setDraft({ ...draft, facts: { ...draft.facts, [key]: value } })
  }

  const handleAddFact = () => {
    if (!draft) return
    let i = 1
    let key = 'fact'
    while (key in draft.facts) {
      key = `fact-${i}`
      i++
    }
    setDraft({ ...draft, facts: { ...draft.facts, [key]: '' } })
  }

  const handleRemoveFact = (key: string) => {
    if (!draft) return
    const facts = { ...draft.facts }
    delete facts[key]
    setDraft({ ...draft, facts })
  }

  return (
    <div className="flex h-full min-w-0">
      <ScrollArea className="w-72 border-r border-border shrink-0 p-3">
        {CODEX_TYPES.map((type) => {
          const items = entries.filter((e) => e.type === type)
          return (
            <div key={type} className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t(CODEX_TYPE_LABELS[type])}
                </h3>
                <button
                  type="button"
                  onClick={() => setCreatingType(creatingType === type ? null : type)}
                  className="text-xs text-accent-primary hover:underline"
                >
                  {t({ en: '+ New', fr: '+ Nouveau' })}
                </button>
              </div>
              {creatingType === type && (
                <div className="flex gap-1 mb-2">
                  <Input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate(type)}
                    placeholder={t({ en: 'Title…', fr: 'Titre…' })}
                    className="text-xs py-1"
                  />
                  <Button size="sm" onClick={() => handleCreate(type)}>
                    {t({ en: 'Add', fr: 'Ajouter' })}
                  </Button>
                </div>
              )}
              {items.length === 0 ? (
                <p className="text-xs text-text-muted italic">{t({ en: 'None yet', fr: 'Aucune entrée' })}</p>
              ) : (
                <ul className="space-y-0.5">
                  {items.map((entry) => (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        onClick={() => setSelected({ type, slug: entry.slug })}
                        className={`w-full text-left px-2 py-1 rounded text-sm truncate ${
                          selected?.type === type && selected.slug === entry.slug
                            ? 'bg-accent-primary/20 text-accent-primary'
                            : 'text-text-primary hover:bg-bg-tertiary'
                        }`}
                      >
                        {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
        {loading && <p className="text-xs text-text-muted">{t({ en: 'Loading…', fr: 'Chargement…' })}</p>}
      </ScrollArea>

      <ScrollArea className="flex-1 min-w-0 p-6">
        {!draft ? (
          <p className="text-text-muted">
            {t({ en: 'Select or create a Codex entry.', fr: 'Sélectionnez ou créez une entrée du Codex.' })}
          </p>
        ) : (
          <div className="max-w-2xl">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="text-lg font-semibold mb-4 w-full"
            />

            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                {t({ en: 'Quick facts', fr: 'Faits rapides' })}
              </h4>
              <div className="space-y-1.5">
                {Object.entries(draft.facts).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <Input value={key} readOnly className="w-32 text-xs py-1 bg-bg-secondary text-text-muted" />
                    <Input
                      value={String(value ?? '')}
                      onChange={(e) => handleFactChange(key, e.target.value)}
                      className="flex-1 text-xs py-1"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFact(key)}
                      className="text-accent-error/70 hover:text-accent-error px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddFact}
                className="text-xs text-accent-primary hover:underline mt-1.5"
              >
                {t({ en: '+ Add fact', fr: '+ Ajouter un fait' })}
              </button>
            </div>

            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                {t({ en: 'Description', fr: 'Description' })}
              </h4>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={16}
                className="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
              />
            </div>

            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? t({ en: 'Saving…', fr: 'Enregistrement…' }) : t({ en: 'Save', fr: 'Enregistrer' })}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
