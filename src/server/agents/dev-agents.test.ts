import { describe, expect, it } from 'vitest'
import { loadDefaultAgents } from './registry.js'
import type { AgentDefinition } from './types.js'

/**
 * The dev function's sub-agents. Their tools are the contract that matters: a reviewer must not
 * be able to write, and no sub-agent may start another one.
 */
const DEV_SUB_AGENTS = {
  architect: { writes: false },
  security_reviewer: { writes: false },
  test_runner: { writes: false },
  debugger: { writes: false },
  refactorer: { writes: true },
  performance_engineer: { writes: false },
  docs_writer: { writes: true },
} as const

async function byId(): Promise<Map<string, AgentDefinition>> {
  const agents = await loadDefaultAgents()
  return new Map(agents.map((agent) => [agent.metadata.id, agent]))
}

describe('dev sub-agents', () => {
  it.each(Object.keys(DEV_SUB_AGENTS))('%s is a dev sub-agent', async (id) => {
    const agent = (await byId()).get(id)
    expect(agent, `${id} is not loaded`).toBeDefined()
    expect(agent!.metadata.subagent).toBe(true)
    expect(agent!.metadata.category).toBe('dev')
    expect(agent!.metadata.description.length).toBeGreaterThan(10)
  })

  it.each(Object.entries(DEV_SUB_AGENTS))('%s has the least privilege its role needs', async (id, { writes }) => {
    const tools = (await byId()).get(id)?.metadata.allowedTools ?? []
    expect(tools.length).toBeGreaterThan(0)
    const canWrite = tools.includes('write_file') || tools.includes('edit_file')
    expect(canWrite).toBe(writes)
    expect(tools).not.toContain('call_sub_agent')
  })

  it.each(Object.keys(DEV_SUB_AGENTS))('%s defines what it reports back', async (id) => {
    const prompt = (await byId()).get(id)?.prompt ?? ''
    expect(prompt).toMatch(/## Report format/)
  })

  it('gives every dev sub-agent its own color', async () => {
    const agents = await byId()
    const colors = Object.keys(DEV_SUB_AGENTS).map((id) => agents.get(id)?.metadata.color)
    expect(colors.every(Boolean)).toBe(true)
    expect(new Set(colors).size).toBe(colors.length)
  })
})

describe('security_reviewer', () => {
  it('triages before reporting and records findings where the finalize gate reads them', async () => {
    const prompt = (await byId()).get('security_reviewer')?.prompt ?? ''
    // The three questions that cut false positives.
    expect(prompt).toMatch(/attacker-controlled input/i)
    expect(prompt).toMatch(/reachable/i)
    expect(prompt).toMatch(/blast radius/i)
    // Noise that must not fill a blocking gate.
    expect(prompt).toMatch(/denial of service/i)
    expect(prompt).toMatch(/rate limiting/i)
    // Findings go through the same key as the code review, so finalize waits for them.
    expect(prompt).toContain('review_findings')
    expect(prompt).toMatch(/No security findings/)
    // Reviews the change, not the whole tree.
    expect(prompt).toMatch(/git diff/)
  })
})

describe('architect', () => {
  it('stays inside the project and may conclude there is nothing to say', async () => {
    const prompt = (await byId()).get('architect')?.prompt ?? ''
    expect(prompt).toMatch(/No architectural concerns/)
    expect(prompt).toMatch(/return_value/)
  })
})

describe('task board instructions', () => {
  it.each(['planner', 'builder'])('%s knows when to record a task, with the type tags', async (id) => {
    const agent = (await byId()).get(id)
    expect(agent?.metadata.allowedTools).toContain('project_tasks')
    const prompt = agent?.prompt ?? ''
    expect(prompt).toContain('project_tasks')
    for (const tag of ['[bug]', '[suite]']) expect(prompt).toContain(tag)
    // Look first, so the board does not collect duplicates.
    expect(prompt).toMatch(/list/i)
  })

  it('tells the builder the run is traced for it, so it does not open a card for its own work', async () => {
    const prompt = (await byId()).get('builder')?.prompt ?? ''
    expect(prompt).toMatch(/Build & Verify/)
    expect(prompt).toMatch(/automatically/i)
  })

  it('tells the planner a bug report or a "note it for later" becomes a card instead of a plan', async () => {
    const prompt = (await byId()).get('planner')?.prompt ?? ''
    expect(prompt).toMatch(/later/i)
    expect(prompt).toContain('[bug]')
  })
})
