import { describe, expect, it } from 'vitest'
import { EMPTY_CHAT_SETTINGS_FORM, PERSONA_PRESETS, fromForm, hasOverrides, toForm } from './chat-settings'

describe('chat settings form', () => {
  it('an empty form overrides nothing', () => {
    expect(fromForm(EMPTY_CHAT_SETTINGS_FORM)).toEqual({ ok: true, settings: {} })
    expect(hasOverrides({})).toBe(false)
  })

  it('sends only the filled fields, as numbers, with a trimmed persona', () => {
    expect(fromForm({ temperature: '0.7', topP: '', maxTokens: '2048', systemPrompt: '  Be brief.  ' })).toEqual({
      ok: true,
      settings: { temperature: 0.7, maxTokens: 2048, systemPrompt: 'Be brief.' },
    })
  })

  it.each([
    [{ temperature: '3' }, 'temperature'],
    [{ temperature: 'abc' }, 'temperature'],
    [{ topP: '1.5' }, 'topP'],
    [{ maxTokens: '0' }, 'maxTokens'],
    [{ maxTokens: '10.5' }, 'maxTokens'],
  ])('rejects %j', (patch, field) => {
    expect(fromForm({ ...EMPTY_CHAT_SETTINGS_FORM, ...patch })).toEqual({ ok: false, field })
  })

  it('round-trips through the form', () => {
    const settings = { temperature: 1, topP: 0.9, maxTokens: 512, systemPrompt: 'Pirate.' }
    expect(fromForm(toForm(settings))).toEqual({ ok: true, settings })
    expect(hasOverrides(settings)).toBe(true)
  })

  it('ships distinct persona presets', () => {
    expect(new Set(PERSONA_PRESETS.map((p) => p.id)).size).toBe(PERSONA_PRESETS.length)
    for (const preset of PERSONA_PRESETS) expect(preset.prompt.length).toBeGreaterThan(20)
  })
})
