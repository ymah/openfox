import { describe, expect, it } from 'vitest'
import { loadDefaultWorkflows } from './registry.js'
import { loadDefaultAgents } from '../agents/registry.js'
import type { WorkflowDefinition } from './types.js'

/**
 * Structural checks on the built-in dev workflows: a step nothing can reach, a transition into
 * the void or an agent that does not exist only shows up as a stuck run, so catch it here.
 */
const DEV_WORKFLOWS = ['default', 'dev-audit']
const TERMINALS = new Set(['$done', '$blocked'])

function stepIds(workflow: WorkflowDefinition): Set<string> {
  return new Set(workflow.steps.map((step) => step.id))
}

function reachable(workflow: WorkflowDefinition): Set<string> {
  const byId = new Map(workflow.steps.map((step) => [step.id, step]))
  const seen = new Set<string>()
  const queue = [workflow.entryStep]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id) || TERMINALS.has(id)) continue
    seen.add(id)
    for (const transition of byId.get(id)?.transitions ?? []) queue.push(transition.goto)
  }
  return seen
}

async function workflow(id: string): Promise<WorkflowDefinition> {
  const found = (await loadDefaultWorkflows()).find((w) => w.metadata.id === id)
  expect(found, `workflow ${id} is not loaded`).toBeDefined()
  return found!
}

describe.each(DEV_WORKFLOWS)('built-in workflow %s', (id) => {
  it('belongs to the dev function', async () => {
    expect((await workflow(id)).metadata.category).toBe('dev')
  })

  it('reaches every step from its entry step', async () => {
    const wf = await workflow(id)
    expect([...reachable(wf)].sort()).toEqual([...stepIds(wf)].sort())
  })

  it('only transitions to steps that exist or to a terminal', async () => {
    const wf = await workflow(id)
    const known = stepIds(wf)
    for (const step of wf.steps) {
      for (const transition of step.transitions) {
        expect(known.has(transition.goto) || TERMINALS.has(transition.goto), `${step.id} -> ${transition.goto}`).toBe(
          true,
        )
      }
    }
  })

  it('only uses agents that are loaded', async () => {
    const wf = await workflow(id)
    const agents = new Set((await loadDefaultAgents()).map((a) => a.metadata.id))
    for (const step of wf.steps as unknown as Array<{ id: string; agentId?: string; subAgentType?: string }>) {
      if (step.agentId) expect(agents.has(step.agentId), `${step.id} uses ${step.agentId}`).toBe(true)
      if (step.subAgentType) expect(agents.has(step.subAgentType), `${step.id} uses ${step.subAgentType}`).toBe(true)
    }
  })
})

describe('Build & Verify', () => {
  it('has an architecture review before implementing', async () => {
    const wf = await workflow('default')
    const next = (stepId: string) => wf.steps.find((s) => s.id === stepId)!.transitions.map((t) => t.goto)
    expect(next('work_location')).toEqual(['architecture', 'setup_workspace'])
    expect(next('setup_workspace')).toEqual(['architecture'])
    expect(next('architecture')).toEqual(['build'])
    const architecture = wf.steps.find((s) => s.id === 'architecture') as unknown as { subAgentType: string }
    expect(architecture.subAgentType).toBe('architect')
  })

  it('runs a security review after the code review and before finalizing', async () => {
    const wf = await workflow('default')
    const next = (stepId: string) => wf.steps.find((s) => s.id === stepId)!.transitions.map((t) => t.goto)
    expect(next('code_review')).toEqual(['security_review'])
    expect(next('security_review')).toEqual(['finalize'])
    const security = wf.steps.find((s) => s.id === 'security_review') as unknown as { subAgentType: string }
    expect(security.subAgentType).toBe('security_reviewer')
  })

  it('makes finalize wait for the security findings too', async () => {
    const wf = await workflow('default')
    const finalize = wf.steps.find((s) => s.id === 'finalize') as unknown as { prompt: string }
    expect(finalize.prompt).toMatch(/security/i)
    expect(finalize.prompt).toContain('review_findings')
  })
})

describe('dev audit workflow', () => {
  it('is read-only: architecture, then security, then a report by a read-only agent', async () => {
    const wf = await workflow('dev-audit')
    expect(wf.steps.map((s) => s.id)).toEqual(['architecture', 'security', 'report'])
    const agents = new Map((await loadDefaultAgents()).map((a) => [a.metadata.id, a]))
    for (const step of wf.steps as unknown as Array<{ agentId?: string; subAgentType?: string }>) {
      const tools = agents.get(step.agentId ?? step.subAgentType ?? '')?.metadata.allowedTools ?? []
      expect(tools).not.toContain('write_file')
      expect(tools).not.toContain('edit_file')
    }
  })

  it('takes an optional scope', async () => {
    const wf = await workflow('dev-audit')
    const scope = wf.metadata.parameters?.find((p) => p.id === 'scope')
    expect(scope).toBeDefined()
    expect(scope!.required).toBeFalsy()
  })
})
