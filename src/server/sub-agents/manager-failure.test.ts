/**
 * A sub-agent whose LLM retry window is exhausted must surface the failure —
 * never an empty "success" that lets a workflow advance or tells the parent
 * agent the task went fine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { runTopLevelAgentLoopMock } = vi.hoisted(() => ({ runTopLevelAgentLoopMock: vi.fn() }))

vi.mock('../chat/agent-loop.js', () => ({
  runTopLevelAgentLoop: runTopLevelAgentLoopMock,
}))
vi.mock('../events/index.js', () => ({
  getEventStore: vi.fn(() => ({ append: vi.fn(), getLatestSeq: vi.fn(() => 0), getEvents: vi.fn(() => []) })),
  getCurrentContextWindowId: vi.fn(() => undefined),
}))
vi.mock('../context/instructions.js', () => ({
  getAllInstructions: vi.fn(async () => ({ content: '', files: [] })),
}))
vi.mock('../skills/registry.js', () => ({
  getEnabledSkillMetadata: vi.fn(async () => []),
}))
vi.mock('../runtime-config.js', () => ({
  getRuntimeConfig: vi.fn(() => ({
    mode: 'development',
    context: { compactionThreshold: 0.9 },
    agent: { toolTimeout: 120000 },
  })),
}))
vi.mock('../agents/model-overrides.js', () => ({
  resolveAgentModelOverride: vi.fn(() => ({ kind: 'none' })),
}))
vi.mock('../agents/registry.js', () => ({
  loadAllAgentsDefault: vi.fn(async () => [
    {
      metadata: { id: 'explorer', name: 'Explorer', description: '', category: 'dev', subagent: true },
      systemPrompt: 'You explore.',
      tools: ['return_value'],
    },
  ]),
  findAgentById: vi.fn((id: string, agents: any[]) => agents.find((a) => a.metadata.id === id)),
  getSubAgents: vi.fn(() => []),
}))

import { executeSubAgent } from './manager.js'
import { LLMError } from '../utils/errors.js'

function createDeps() {
  return {
    subAgentType: 'explorer',
    prompt: 'Explore.',
    sessionManager: {
      requireSession: vi.fn(() => ({ id: 's', workdir: '/tmp', projectId: 'p', mode: 'planner', metadataEntries: {} })),
      getSession: vi.fn(() => ({ id: 's', workdir: '/tmp', projectId: 'p', mode: 'planner', metadataEntries: {} })),
      getEffectiveWorkdir: vi.fn(() => '/tmp'),
      getProjectWorkdir: vi.fn(() => '/tmp'),
      getProviderManager: vi.fn(() => undefined),
      resolveEffectiveProviderModel: vi.fn(() => ({ providerId: null, model: null })),
      getCurrentModelSettings: vi.fn(() => undefined),
      getCurrentWindowMessages: vi.fn(() => []),
      setCurrentContextSize: vi.fn(),
      getContextState: vi.fn(() => ({ currentTokens: 0, maxTokens: 100000, compactionCount: 0 })),
      getSubAgentContextSize: vi.fn(() => undefined),
    } as any,
    sessionId: 's',
    llmClient: { getModel: () => 'm', getBackend: () => 'ollama', getProfile: () => ({ contextWindow: 1 }) } as any,
    toolRegistry: { tools: [], definitions: [], execute: vi.fn() } as any,
    turnMetrics: {
      start: vi.fn(),
      end: vi.fn(),
      addLLMCall: vi.fn(),
      addToolTime: vi.fn(),
      buildStats: vi.fn(() => ({})),
    } as any,
    statsIdentity: { providerId: 'p', providerName: 'p', backend: 'ollama', model: 'm' } as any,
  }
}

describe('executeSubAgent LLM failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws an LLMError instead of returning an empty success when the loop reports a failure', async () => {
    runTopLevelAgentLoopMock.mockResolvedValue({ failed: { error: 'LLM unreachable' } })

    await expect(executeSubAgent(createDeps() as any)).rejects.toBeInstanceOf(LLMError)
  })

  it('still returns the value when the loop succeeds', async () => {
    runTopLevelAgentLoopMock.mockResolvedValue({ returnValueContent: 'done', returnValueResult: 'success' })

    const result = await executeSubAgent(createDeps() as any)
    expect(result).toEqual({ content: 'done', result: 'success' })
  })
})
