import { describe, it, expect } from 'vitest'
import { parseSlashCommand, extractTemplateParams, type WorkflowInfo, type CommandInfo } from './parse-slash-command'

const workflows: WorkflowInfo[] = [
  {
    id: 'gtd-capture',
    name: 'GTD — Capture',
    scope: 'builtin',
    parameters: [{ id: 'idea', label: 'Idée', position: 0, required: true }],
  },
  {
    id: 'writing-enrich-codex',
    name: 'Écriture — Enrichir le Codex',
    scope: 'builtin',
    parameters: [
      { id: 'entry_path', label: 'Entrée Codex', position: 0, required: true },
      { id: 'brief', label: 'Ce qu’il faut ajouter', position: 1, required: true },
    ],
  },
  { id: 'no-params-workflow', name: 'No Params', scope: 'builtin' },
]

const commands: CommandInfo[] = [{ id: 'greet', name: 'Greet' }]

describe('parseSlashCommand', () => {
  it('returns null for input that is not a slash command', () => {
    expect(parseSlashCommand('hello world', workflows)).toBeNull()
  })

  it('returns null for an unknown id', () => {
    expect(parseSlashCommand('/does-not-exist arg', workflows)).toBeNull()
  })

  it('maps a single free-text parameter, keeping every word', () => {
    const result = parseSlashCommand('/gtd-capture buy milk and eggs', workflows)
    expect(result).toEqual({ workflowId: 'gtd-capture', params: { idea: 'buy milk and eggs' } })
  })

  it('maps earlier positional parameters one token each, and only the LAST one greedily', () => {
    const result = parseSlashCommand(
      '/writing-enrich-codex codex/characters/lena.md Ajoute des détails sur son enfance',
      workflows,
    )
    expect(result).toEqual({
      workflowId: 'writing-enrich-codex',
      params: {
        entry_path: 'codex/characters/lena.md',
        brief: 'Ajoute des détails sur son enfance',
      },
    })
  })

  it('falls back to positional numeric keys when the workflow declares no parameters', () => {
    const result = parseSlashCommand('/no-params-workflow one two', workflows)
    expect(result).toEqual({ workflowId: 'no-params-workflow', params: { '0': 'one', '1': 'two' } })
  })

  it('matches a command when no workflow matches', () => {
    const result = parseSlashCommand('/greet Alice', workflows, commands)
    expect(result).toEqual({ commandId: 'greet', params: { '0': 'Alice' } })
  })

  it('returns null when neither a workflow nor a command matches', () => {
    expect(parseSlashCommand('/unknown', workflows, commands)).toBeNull()
  })
})

describe('extractTemplateParams', () => {
  it('extracts placeholders in order of first occurrence, deduplicated', () => {
    expect(extractTemplateParams('Hello {{name}}, {{name}} again, then {{other}}')).toEqual(['name', 'other'])
  })

  it('returns an empty array when there are no placeholders', () => {
    expect(extractTemplateParams('no placeholders here')).toEqual([])
  })
})
