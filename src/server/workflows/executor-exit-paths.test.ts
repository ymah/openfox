/**
 * Workflow Executor – exit paths that must leave the execution blocked (never
 * 'running'), and user gates that must pause again when revisited.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkflowDefinition } from './types.js'
import type { OrchestratorOptions } from '../runner/types.js'

// ============================================================================
// Hoisted shared spies — available in both vi.mock factories and test bodies
// ============================================================================

const { mockAppend } = vi.hoisted(() => ({ mockAppend: vi.fn() }))
const { mockRunAgentTurn } = vi.hoisted(() => ({ mockRunAgentTurn: vi.fn() }))

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('../events/index.js', () => ({
  getEventStore: () => ({
    append: mockAppend,
    getLatestSeq: vi.fn(() => 0),
    getEvents: vi.fn(() => []),
    deleteEventsAfterSeq: vi.fn(),
  }),
  getCurrentContextWindowId: vi.fn(() => undefined),
}))

vi.mock('../chat/orchestrator.js', () => ({
  runAgentTurn: mockRunAgentTurn,
  createMessageStartEvent: vi.fn(
    (messageId: string, role: string, content: string | undefined, options?: Record<string, unknown>) => ({
      type: 'message.start',
      data: { messageId, role, content, ...options },
    }),
  ),
  TurnMetrics: class TurnMetrics {
    start = vi.fn()
    end = vi.fn()
    addLLMCall = vi.fn()
    addToolTime = vi.fn()
    buildStats = vi.fn(() => ({ durationMs: 0, tokenCount: 0, generationTokens: 0, completionTokens: 0 }))
  },
}))

vi.mock('../sub-agents/manager.js', () => ({
  executeSubAgent: vi.fn(async () => ({ content: '', result: 'success' })),
}))

vi.mock('../agents/registry.js', () => ({
  loadAllAgentsDefault: vi.fn(async () => []),
  findAgentById: vi.fn(() => undefined),
  resolveDefaultAgentId: vi.fn(() => 'planner'),
}))

vi.mock('../tools/index.js', () => ({
  getToolRegistryForAgent: vi.fn(() => ({ tools: [], definitions: [], execute: vi.fn() })),
}))

vi.mock('./shell.js', () => ({
  executeShellCommand: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
}))

vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../../shared/stats.js', () => ({
  computeSessionStats: vi.fn(() => ({ generationTokens: 0, avgGenerationSpeed: 0, responseCount: 0, llmCallCount: 0 })),
}))

vi.mock('../git/diff.js', () => ({
  formatGitDiffFiles: vi.fn(async () => '(none)'),
}))

import { executeWorkflow } from './executor.js'

// ============================================================================
// Helpers
// ============================================================================

function createMockOptions(extra?: Partial<OrchestratorOptions>): OrchestratorOptions {
  return {
    scope: 'auto',
    sessionManager: {
      requireSession: vi.fn(() => ({
        workdir: '/tmp/test',
        projectId: 'project-1',
        messages: [],
        metadataEntries: {},
      })),
      setMode: vi.fn(),
      setPhase: vi.fn(),
      getEffectiveWorkdir: vi.fn().mockReturnValue('/tmp/test'),
      getProjectWorkdir: vi.fn().mockReturnValue('/tmp/test'),
      getProviderManager: vi.fn(() => undefined),
      addMessage: vi.fn(),
      startWorkflow: vi.fn(),
      updateWorkflowStep: vi.fn(),
      completeWorkflow: vi.fn(),
      blockWorkflow: vi.fn(),
      waitAtStep: vi.fn(),
      resumeWorkflow: vi.fn(),
      getActiveWorkflowExecution: vi.fn(() => ({ id: 'exec-1', status: 'running' })),
      cancelWorkflow: vi.fn(),
    } as any,
    sessionId: 'test-session',
    llmClient: { getModel: () => 'test-model' } as any,
    ...extra,
  }
}

/** approve (user gate) → "Affiner" loops back to clarify → approve again. */
function createGateLoopWorkflow(): WorkflowDefinition {
  return {
    metadata: { id: 'gate-loop', name: 'Gate loop', description: '', version: '1' },
    entryStep: 'clarify',
    settings: { maxIterations: 10 },
    steps: [
      {
        id: 'clarify',
        name: 'Clarify',
        type: 'agent',
        phase: 'plan',
        agentId: 'planner',
        prompt: 'Clarify.',
        transitions: [{ when: { type: 'always' }, goto: 'approve' }],
      },
      {
        id: 'approve',
        name: 'Approve',
        type: 'user',
        phase: 'plan',
        choices: [
          { id: 'Valider', label: 'Valider' },
          { id: 'Affiner', label: 'Affiner' },
        ],
        transitions: [
          { when: { type: 'step_result', result: 'Valider' }, goto: '$done' },
          { when: { type: 'step_result', result: 'Affiner' }, goto: 'clarify' },
          { when: { type: 'always' }, goto: '$done' },
        ],
      } as any,
    ],
  }
}

function stepDoneAgent() {
  mockRunAgentTurn.mockImplementation(
    async (
      _opts: any,
      _metrics: any,
      _agentId: string,
      _append: any,
      extra: { onToolExecuted?: (tc: any, tr: any) => void } | undefined,
    ) => {
      extra?.onToolExecuted?.({ name: 'step_done', arguments: {} }, { success: true, output: '' })
      return { returnValueResult: 'completed', returnValueContent: '' }
    },
  )
}

// ============================================================================
// Tests
// ============================================================================

describe('workflow executor exit paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('re-pauses at a user gate the second time it is reached after a resume (no infinite loop)', async () => {
    stepDoneAgent()
    const options = createMockOptions({ resumeFromStep: 'approve', userChoice: 'Affiner', initialStepOutput: {} })

    const result = await executeWorkflow(createGateLoopWorkflow(), options)

    // Resume consumes "Affiner" once: clarify runs, then approve pauses again.
    expect(mockRunAgentTurn).toHaveBeenCalledTimes(1)
    expect(result.finalAction.type).toBe('WAITING')
    expect((options.sessionManager as any).waitAtStep).toHaveBeenCalledTimes(1)
    expect((options.sessionManager as any).blockWorkflow).not.toHaveBeenCalled()
  })

  it('blocks the execution when max iterations is reached', async () => {
    // Agent never calls step_done → the agent step loops until maxIterations.
    mockRunAgentTurn.mockResolvedValue({ returnValueResult: 'completed', returnValueContent: '' })
    const workflow: WorkflowDefinition = {
      metadata: { id: 'loop', name: 'Loop', description: '', version: '1' },
      entryStep: 'build',
      settings: { maxIterations: 3 },
      steps: [
        {
          id: 'build',
          name: 'Build',
          type: 'agent',
          phase: 'build',
          agentId: 'builder',
          prompt: 'Build.',
          transitions: [{ when: { type: 'always' }, goto: '$done' }],
        },
      ],
    }
    const options = createMockOptions()

    const result = await executeWorkflow(workflow, options)

    expect(result.finalAction.type).toBe('BLOCKED')
    expect((options.sessionManager as any).blockWorkflow).toHaveBeenCalled()
  })

  it('blocks the execution when the current step does not exist', async () => {
    const workflow: WorkflowDefinition = {
      metadata: { id: 'broken', name: 'Broken', description: '', version: '1' },
      entryStep: 'missing',
      settings: { maxIterations: 3 },
      steps: [],
    }
    const options = createMockOptions()

    const result = await executeWorkflow(workflow, options)

    expect(result.finalAction.type).toBe('BLOCKED')
    expect((options.sessionManager as any).blockWorkflow).toHaveBeenCalled()
  })

  it('blocks (does not advance) when a sub-agent step fails on an exhausted LLM retry window', async () => {
    const { executeSubAgent } = await import('../sub-agents/manager.js')
    const { LLMError } = await import('../utils/errors.js')
    ;(executeSubAgent as any).mockRejectedValueOnce(new LLMError('LLM unreachable'))
    stepDoneAgent()
    const workflow: WorkflowDefinition = {
      metadata: { id: 'sub', name: 'Sub', description: '', version: '1' },
      entryStep: 'draft',
      settings: { maxIterations: 5 },
      steps: [
        {
          id: 'draft',
          name: 'Draft',
          type: 'sub_agent',
          phase: 'build',
          subAgentType: 'writer',
          prompt: 'Draft.',
          transitions: [{ when: { type: 'always' }, goto: 'report' }],
        } as any,
        {
          id: 'report',
          name: 'Report',
          type: 'agent',
          phase: 'build',
          agentId: 'planner',
          prompt: 'Report.',
          transitions: [{ when: { type: 'always' }, goto: '$done' }],
        },
      ],
    }
    const options = createMockOptions()
    const { findAgentById } = await import('../agents/registry.js')
    ;(findAgentById as any).mockReturnValue({ metadata: { id: 'writer' } })

    const result = await executeWorkflow(workflow, options)

    expect(result.finalAction.type).toBe('BLOCKED')
    expect((options.sessionManager as any).blockWorkflow).toHaveBeenCalled()
    // The report step must NOT have run on an empty draft
    expect(mockRunAgentTurn).not.toHaveBeenCalled()
  })
})
