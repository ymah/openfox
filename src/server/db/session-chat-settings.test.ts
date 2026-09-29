import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { closeDatabase, initDatabase } from './index.js'
import { createProject } from './projects.js'
import { createSession, deleteSession } from './sessions.js'
import {
  MAX_SYSTEM_PROMPT_LENGTH,
  getSessionChatSettings,
  parseSessionChatSettings,
  setSessionChatSettings,
} from './session-chat-settings.js'

describe('parseSessionChatSettings', () => {
  it('keeps valid fields, trims the persona and drops unknown keys', () => {
    const result = parseSessionChatSettings({
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      systemPrompt: '  Be a pirate.  ',
      evil: 'x',
    })
    expect(result).toEqual({
      ok: true,
      settings: { temperature: 0.7, topP: 0.9, maxTokens: 2048, systemPrompt: 'Be a pirate.' },
    })
  })

  it('treats null and empty values as "no override"', () => {
    expect(parseSessionChatSettings({ temperature: null, topP: '', systemPrompt: '   ' })).toEqual({
      ok: true,
      settings: {},
    })
  })

  it.each([
    [{ temperature: 3 }, /temperature/],
    [{ temperature: 'hot' }, /temperature/],
    [{ topP: 1.5 }, /topP/],
    [{ maxTokens: 0 }, /maxTokens/],
    [{ maxTokens: 10.5 }, /integer/],
    [{ systemPrompt: 42 }, /systemPrompt/],
    [{ systemPrompt: 'x'.repeat(MAX_SYSTEM_PROMPT_LENGTH + 1) }, /limited/],
  ])('rejects %j', (input, message) => {
    const result = parseSessionChatSettings(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(message)
  })

  it('rejects a non-object', () => {
    expect(parseSessionChatSettings(null).ok).toBe(false)
    expect(parseSessionChatSettings([]).ok).toBe(false)
    expect(parseSessionChatSettings('x').ok).toBe(false)
  })
})

describe('session chat settings storage', () => {
  let root: string
  let sessionId: string

  beforeEach(async () => {
    closeDatabase()
    const config = loadConfig()
    config.database.path = ':memory:'
    initDatabase(config)
    root = await mkdtemp(join(tmpdir(), 'openfox-chat-settings-'))
    const project = createProject('P', root)
    sessionId = createSession(project.id, root, 'S').id
  })

  afterEach(async () => {
    closeDatabase()
    await rm(root, { recursive: true, force: true })
  })

  it('is empty until set, then round-trips', () => {
    expect(getSessionChatSettings(sessionId)).toEqual({})
    setSessionChatSettings(sessionId, { temperature: 0.2, systemPrompt: 'Terse.' })
    expect(getSessionChatSettings(sessionId)).toEqual({ temperature: 0.2, systemPrompt: 'Terse.' })
  })

  it('replaces rather than merges, and an empty object resets', () => {
    setSessionChatSettings(sessionId, { temperature: 0.2, topP: 0.5 })
    setSessionChatSettings(sessionId, { topP: 0.8 })
    expect(getSessionChatSettings(sessionId)).toEqual({ topP: 0.8 })
    setSessionChatSettings(sessionId, {})
    expect(getSessionChatSettings(sessionId)).toEqual({})
  })

  it('is removed with the session', () => {
    setSessionChatSettings(sessionId, { temperature: 0.2 })
    deleteSession(sessionId)
    expect(getSessionChatSettings(sessionId)).toEqual({})
  })
})

describe('chat settings reach the request', () => {
  let root: string
  let sessionId: string
  let projectId: string

  beforeEach(async () => {
    closeDatabase()
    const config = loadConfig()
    config.database.path = ':memory:'
    initDatabase(config)
    root = await mkdtemp(join(tmpdir(), 'openfox-chat-settings-req-'))
    projectId = createProject('P', root).id
    sessionId = createSession(projectId, root, 'S').id
  })

  afterEach(async () => {
    closeDatabase()
    await rm(root, { recursive: true, force: true })
  })

  it('session sampling overrides model settings field by field', async () => {
    const { applySessionSampling } = await import('../session/manager.js')
    const base = { temperature: 0.6, topP: 0.95, maxTokens: 4096, supportsVision: true }
    expect(applySessionSampling(base, sessionId)).toBe(base) // nothing set: untouched, same object

    setSessionChatSettings(sessionId, { temperature: 1.1, maxTokens: 512 })
    expect(applySessionSampling(base, sessionId)).toEqual({
      temperature: 1.1,
      topP: 0.95,
      maxTokens: 512,
      supportsVision: true,
    })
    expect(applySessionSampling(undefined, sessionId)).toEqual({ temperature: 1.1, maxTokens: 512 })
  })

  it('the persona is appended to the session instructions, and only for that session', async () => {
    const { getAllInstructions } = await import('../context/instructions.js')
    const other = createSession(projectId, root, 'Other').id
    setSessionChatSettings(sessionId, { systemPrompt: 'Answer like a pirate.' })

    const withPersona = await getAllInstructions(root, projectId, sessionId)
    expect(withPersona.content).toContain('## PERSONA')
    expect(withPersona.content).toContain('Answer like a pirate.')

    expect((await getAllInstructions(root, projectId, other)).content).not.toContain('PERSONA')
    expect((await getAllInstructions(root, projectId)).content).not.toContain('PERSONA')
  })
})
