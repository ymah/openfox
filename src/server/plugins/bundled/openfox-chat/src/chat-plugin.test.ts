import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain JS module without type declarations
import { register } from './index.js'
// @ts-expect-error — plain JS module without type declarations
import { agentSource, workflowSource } from '../../_shared/content-sources.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

interface LoadedAgent {
  id: string
  category?: string
  subagent?: boolean
  basePrompt?: string
  filterTools?: boolean
  allowedTools: string[]
}
interface LoadedWorkflow {
  metadata: { id: string; category?: string; parameters?: { id: string }[] }
  entryStep: string
  steps: { id: string; type: string; agentId?: string; prompt?: string; transitions: { goto: string }[] }[]
}

const agents = (await agentSource('a', 'a', join(root, 'agents')).load()) as LoadedAgent[]
const workflows = (await workflowSource('w', 'w', join(root, 'workflows')).load()) as LoadedWorkflow[]

// Tools a chat agent must never be given: it has no repository and no shell.
const CODE_TOOLS = ['run_command', 'write_file', 'edit_file', 'read_file', 'call_sub_agent', 'background_process']

describe('openfox-chat agents', () => {
  it('ships the six default assistants', () => {
    expect(agents.map((a) => a.id).sort()).toEqual([
      'chat-assistant',
      'chat-brainstorm',
      'chat-editor',
      'chat-researcher',
      'chat-translator',
      'chat-tutor',
    ])
  })

  it.each(agents.map((a) => [a.id, a] as const))('%s is a conversational top-level chat agent', (_id, agent) => {
    expect(agent.category).toBe('chat')
    expect(agent.subagent).toBe(false)
    expect(agent.basePrompt).toBe('assistant')
    expect(agent.filterTools).toBe(true)
    for (const tool of CODE_TOOLS) expect(agent.allowedTools).not.toContain(tool)
  })

  it('only the research-capable agents can reach the web', () => {
    const withWeb = agents.filter((a) => a.allowedTools.includes('web_search')).map((a) => a.id)
    expect(withWeb.sort()).toEqual(['chat-assistant', 'chat-researcher', 'chat-tutor'])
    expect(agents.find((a) => a.id === 'chat-translator')!.allowedTools).not.toContain('web_fetch')
  })
})

describe('openfox-chat workflows', () => {
  it('ships the seven default workflows', () => {
    expect(workflows.map((w) => w.metadata.id).sort()).toEqual([
      'chat-decide',
      'chat-deep-research',
      'chat-draft-critique',
      'chat-fact-check',
      'chat-learn',
      'chat-summarize',
      'chat-translate-check',
    ])
  })

  it.each(workflows.map((w) => [w.metadata.id, w] as const))('%s is well formed', (_id, workflow) => {
    const stepIds = new Set(workflow.steps.map((s) => s.id))
    const agentIds = new Set(agents.map((a) => a.id))
    expect(workflow.metadata.category).toBe('chat')
    expect(stepIds.has(workflow.entryStep)).toBe(true)
    for (const step of workflow.steps) {
      expect(step.transitions.length).toBeGreaterThan(0)
      // Every transition lands on a real step, or ends the workflow.
      for (const transition of step.transitions)
        expect(stepIds.has(transition.goto) || transition.goto === '$done').toBe(true)
      // Agent steps run a shipped chat agent, never a coding one.
      if (step.type === 'agent') expect(agentIds.has(step.agentId ?? '')).toBe(true)
    }
    // A path leads out: some transition reaches $done.
    expect(workflow.steps.some((s) => s.transitions.some((t) => t.goto === '$done'))).toBe(true)
  })

  it('every {{parameter}} used in a prompt is declared', () => {
    for (const workflow of workflows) {
      const declared = new Set((workflow.metadata.parameters ?? []).map((p) => p.id))
      for (const step of workflow.steps) {
        for (const [, name] of (step.prompt ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
          expect(declared.has(name!), `${workflow.metadata.id}/${step.id} uses undeclared {{${name}}}`).toBe(true)
        }
      }
    }
  })

  it('has no stray files in the workflows directory', () => {
    expect(readdirSync(join(root, 'workflows')).every((f) => f.endsWith('.workflow.json'))).toBe(true)
  })
})

describe('openfox-chat registration', () => {
  it('declares the chat mode without git, seeded with the assistant', () => {
    const modes: unknown[] = []
    const sources: string[] = []
    register({
      registerAgentSource: (s: { id: string }) => sources.push(s.id),
      registerWorkflowSource: (s: { id: string }) => sources.push(s.id),
      registerProjectMode: (m: unknown) => modes.push(m),
    })
    expect(sources).toEqual(['chat-agents', 'chat-workflows'])
    expect(modes).toEqual([expect.objectContaining({ value: 'chat', initGit: false, defaultAgent: 'chat-assistant' })])
  })

  it('its manifest points at a real entry', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
    expect(pkg.openfox.entry).toBe('./src/index.js')
    expect(pkg.openfox.apiVersion).toBe(2)
  })
})
