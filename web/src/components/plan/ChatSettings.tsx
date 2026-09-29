import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '../../lib/api'
import { useT } from '../../hooks/useT'
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice'
import { useApplyDynamicContext } from '../../stores/session/session-scope'
import { DropdownPanel } from '../shared/DropdownPanel'
import {
  EMPTY_CHAT_SETTINGS_FORM,
  PERSONA_PRESETS,
  fromForm,
  hasOverrides,
  toForm,
  type ChatSettings as ChatSettingsData,
  type ChatSettingsForm,
} from '../../lib/chat-settings'

const FIELD_CLASS =
  'w-full rounded border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary'

/**
 * Per-conversation persona and sampling, shown in the composer of chat
 * projects. Empty fields fall back to the model's own settings. A changed
 * persona is applied to the running context straight away (unless a turn is in
 * flight, in which case it is queued like any prompt change).
 */
export function ChatSettings({ sessionId, isRunning }: { sessionId: string; isRunning: boolean }) {
  const t = useT()
  const isModal = useIsTouchDevice()
  const applyDynamicContext = useApplyDynamicContext()
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<ChatSettingsData>({})
  const [form, setForm] = useState<ChatSettingsForm>(EMPTY_CHAT_SETTINGS_FORM)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/sessions/${sessionId}/chat-settings`)
      if (!res.ok) return
      const data = (await res.json()) as { settings: ChatSettingsData }
      setSaved(data.settings)
      setForm(toForm(data.settings))
    } catch {
      /* the button simply shows no override */
    }
  }, [sessionId])

  useEffect(() => {
    setSaved({})
    setForm(EMPTY_CHAT_SETTINGS_FORM)
    void load()
  }, [load])

  async function submit(settings: ChatSettingsData) {
    setBusy(true)
    setError(null)
    try {
      const res = await authFetch(`/api/sessions/${sessionId}/chat-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(
          body.error ?? t({ en: 'Could not save the settings', fr: 'Impossible d’enregistrer les réglages' }),
        )
      }
      const data = (await res.json()) as { settings: ChatSettingsData }
      const personaChanged = (data.settings.systemPrompt ?? '') !== (saved.systemPrompt ?? '')
      setSaved(data.settings)
      setForm(toForm(data.settings))
      if (personaChanged) applyDynamicContext(isRunning)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const parsed = fromForm(form)
    if (!parsed.ok) {
      setError(
        t(
          { en: 'A value is out of range: {{field}}', fr: 'Une valeur est hors limites : {{field}}' },
          { field: parsed.field },
        ),
      )
      return
    }
    void submit(parsed.settings)
  }

  const update = (key: keyof ChatSettingsForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }))
  const active = hasOverrides(saved)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="chat-settings-button"
        title={t({ en: 'Conversation settings', fr: 'Réglages de la conversation' })}
        className="relative flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
      >
        {t({ en: 'Persona & sampling', fr: 'Persona & échantillonnage' })}
        {active && <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" data-testid="chat-settings-active" />}
      </button>

      {open && (
        <DropdownPanel
          isModal={isModal}
          testId="chat-settings-panel"
          onClose={() => setOpen(false)}
          anchoredClassName="right-0 w-80"
        >
          <div className="p-3 flex flex-col gap-3 overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                {t({ en: 'Persona', fr: 'Persona' })}
              </label>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {PERSONA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => update('systemPrompt')(preset.prompt)}
                    className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-secondary hover:text-text-primary"
                  >
                    {t(preset.label)}
                  </button>
                ))}
              </div>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => update('systemPrompt')(e.target.value)}
                rows={4}
                maxLength={8000}
                placeholder={t({
                  en: 'How should the assistant behave in this conversation?',
                  fr: 'Comment l’assistant doit-il se comporter dans cette conversation ?',
                })}
                className={FIELD_CLASS}
                data-testid="chat-settings-persona"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label={t({ en: 'Temperature', fr: 'Température' })}
                value={form.temperature}
                onChange={update('temperature')}
                step="0.1"
                min="0"
                max="2"
                testId="chat-settings-temperature"
                placeholder={t({ en: 'model', fr: 'modèle' })}
              />
              <NumberField
                label="Top-p"
                value={form.topP}
                onChange={update('topP')}
                step="0.05"
                min="0"
                max="1"
                testId="chat-settings-topp"
                placeholder={t({ en: 'model', fr: 'modèle' })}
              />
              <NumberField
                label={t({ en: 'Max tokens', fr: 'Tokens max' })}
                value={form.maxTokens}
                onChange={update('maxTokens')}
                step="1"
                min="1"
                testId="chat-settings-maxtokens"
                placeholder={t({ en: 'model', fr: 'modèle' })}
              />
            </div>
            <p className="text-[11px] text-text-muted">
              {t({
                en: 'Empty fields use the model’s own settings.',
                fr: 'Les champs vides utilisent les réglages du modèle.',
              })}
            </p>

            {error && <p className="text-xs text-accent-error">{error}</p>}

            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => void submit({})}
                disabled={busy || !active}
                className="rounded px-2 py-1 text-xs text-text-muted hover:text-text-primary disabled:opacity-40"
              >
                {t({ en: 'Reset', fr: 'Réinitialiser' })}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                data-testid="chat-settings-save"
                className="rounded bg-accent-primary/25 px-3 py-1 text-xs font-medium text-text-primary hover:bg-accent-primary/40 disabled:opacity-50"
              >
                {t({ en: 'Save', fr: 'Enregistrer' })}
              </button>
            </div>
          </div>
        </DropdownPanel>
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
  testId,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  step: string
  min: string
  max?: string
  testId: string
  placeholder: string
}) {
  return (
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        min={min}
        {...(max ? { max } : {})}
        placeholder={placeholder}
        data-testid={testId}
        className={`${FIELD_CLASS} mt-1`}
      />
    </label>
  )
}
