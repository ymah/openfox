import type { Translation } from '@shared/i18n/index.js'

/** What a conversation can override (mirrors the server's SessionChatSettings). */
export interface ChatSettings {
  temperature?: number
  topP?: number
  maxTokens?: number
  systemPrompt?: string
}

/** Form values as typed: empty string = "not overridden". */
export interface ChatSettingsForm {
  temperature: string
  topP: string
  maxTokens: string
  systemPrompt: string
}

export const EMPTY_CHAT_SETTINGS_FORM: ChatSettingsForm = { temperature: '', topP: '', maxTokens: '', systemPrompt: '' }

export function toForm(settings: ChatSettings): ChatSettingsForm {
  return {
    temperature: settings.temperature?.toString() ?? '',
    topP: settings.topP?.toString() ?? '',
    maxTokens: settings.maxTokens?.toString() ?? '',
    systemPrompt: settings.systemPrompt ?? '',
  }
}

/**
 * The request body for a form: only the fields the user filled in. Returns the
 * first problem instead when a number is out of range, so the server never has
 * to be the one to say so.
 */
export function fromForm(form: ChatSettingsForm): { ok: true; settings: ChatSettings } | { ok: false; field: string } {
  const settings: ChatSettings = {}
  const num = (raw: string, key: 'temperature' | 'topP' | 'maxTokens', min: number, max: number, integer: boolean) => {
    const text = raw.trim()
    if (!text) return true
    const value = Number(text)
    if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return false
    settings[key] = value
    return true
  }
  if (!num(form.temperature, 'temperature', 0, 2, false)) return { ok: false, field: 'temperature' }
  if (!num(form.topP, 'topP', 0, 1, false)) return { ok: false, field: 'topP' }
  if (!num(form.maxTokens, 'maxTokens', 1, 1_000_000, true)) return { ok: false, field: 'maxTokens' }
  if (form.systemPrompt.trim()) settings.systemPrompt = form.systemPrompt.trim()
  return { ok: true, settings }
}

export function hasOverrides(settings: ChatSettings): boolean {
  return Object.keys(settings).length > 0
}

export interface PersonaPreset {
  id: string
  label: Translation
  prompt: string
}

/** Ready-made personas offered in the settings popover. */
export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'concise',
    label: { en: 'Concise', fr: 'Concis' },
    prompt: 'Be extremely concise: answer in as few words as possible, no preamble, no recap.',
  },
  {
    id: 'beginner',
    label: { en: 'Explain simply', fr: 'Explique simplement' },
    prompt:
      'Explain as if to a curious beginner: plain words, no jargon unless you define it, concrete everyday examples.',
  },
  {
    id: 'socratic',
    label: { en: 'Socratic', fr: 'Socratique' },
    prompt:
      'Guide with questions instead of giving the answer straight away. Ask one question at a time, build on my answers, and only state the solution if I ask for it.',
  },
  {
    id: 'formal',
    label: { en: 'Formal', fr: 'Formel' },
    prompt: 'Use a formal, professional register. Precise vocabulary, structured answers, no slang or emojis.',
  },
  {
    id: 'devil',
    label: { en: 'Devil’s advocate', fr: 'Avocat du diable' },
    prompt:
      'Challenge my ideas: point out weaknesses, hidden assumptions and counter-arguments before agreeing with anything. Be constructive, not contrarian for its own sake.',
  },
]
