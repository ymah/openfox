/**
 * Runner Orchestrator
 *
 * Loads the active workflow and delegates to the workflow executor
 * (state machine driven). All events are appended to EventStore.
 */

import { beginWorkflowTracking } from '../tasks/workflow-tracker.js'
import { workflowFitsProject } from '../workflows/project-scope.js'
import type { OrchestratorOptions, OrchestratorResult } from './types.js'
import { getProject } from '../db/projects.js'
import type { ProjectType } from '../../shared/types.js'
import { logger } from '../utils/logger.js'
import { getRuntimeConfig } from '../runtime-config.js'
import { getGlobalConfigDir } from '../../cli/paths.js'
import {
  loadAllWorkflows,
  loadDefaultWorkflows,
  loadUserWorkflows,
  loadProjectWorkflows,
  findWorkflowById,
  isDefaultWorkflow,
  normalizeWorkflowScope,
} from '../workflows/registry.js'
import { executeWorkflow } from '../workflows/executor.js'

/**
 * Run the orchestrator loop until done, blocked, or aborted.
 *
 * Loads the workflow (per-session override or global active) and
 * delegates to the workflow executor state machine. When the launcher
 * specifies an explicit scope, the workflow is resolved from that bucket;
 * otherwise (or when the bucket lacks the workflow) server precedence
 * (project > user > builtin) applies.
 */
export async function runOrchestrator(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const runtimeConfig = getRuntimeConfig()
  const configDir = getGlobalConfigDir(runtimeConfig.mode ?? 'production')

  // Also load project workflows so project-specific workflows are discoverable
  const session = options.sessionManager.requireSession(options.sessionId)
  const projectDir = session.workdir

  // The implicit `default` (build & verify) workflow is a dev workflow: a GTD
  // or writing project has no criteria-driven build loop to fall back to.
  let projectType: ProjectType = 'dev'
  try {
    projectType = getProject(session.projectId)?.type ?? 'dev'
  } catch {
    // Project lookup is best-effort (e.g. no DB in unit tests) — assume dev
  }
  const implicitWorkflowId = runtimeConfig.activeWorkflowId ?? (projectType === 'dev' ? 'default' : undefined)
  const workflowId = options.workflowId ?? implicitWorkflowId
  if (!workflowId) {
    throw new Error(`No workflow specified for a ${projectType} project`)
  }

  const scope = normalizeWorkflowScope(options.scope)
  let workflow
  if (scope === 'builtin') {
    workflow = findWorkflowById(workflowId, await loadDefaultWorkflows())
  } else if (scope === 'user') {
    workflow = findWorkflowById(workflowId, await loadUserWorkflows(configDir))
  } else if (scope === 'project') {
    workflow = projectDir ? findWorkflowById(workflowId, await loadProjectWorkflows(projectDir)) : undefined
  } else {
    workflow = undefined
  }

  // Fall back to precedence when the explicit bucket has no matching workflow
  if (!workflow) {
    const workflows = await loadAllWorkflows(configDir, projectDir)
    workflow = findWorkflowById(workflowId, workflows)
  }

  if (!workflow) {
    throw new Error(`Workflow "${workflowId}" not found`)
  }

  if (
    !workflowFitsProject(
      { id: workflow.metadata.id, category: workflow.metadata.category },
      projectType,
      await isDefaultWorkflow(workflow.metadata.id),
    )
  ) {
    throw new Error(`Workflow "${workflowId}" cannot run in a ${projectType} project`)
  }

  // Validate required params
  const requiredParams = (workflow.metadata.parameters ?? []).filter((p) => p.required)
  const suppliedParams = options.params ?? {}
  const missing = requiredParams.filter((p) => !(p.id in suppliedParams))
  if (missing.length > 0) {
    const names = missing.map((p) => p.label || p.id).join(', ')
    throw new Error(`Missing required parameter${missing.length > 1 ? 's' : ''}: ${names}`)
  }

  logger.debug('Using workflow executor', {
    sessionId: options.sessionId,
    workflow: workflow.metadata.id,
    subGroup: options.subGroup,
  })

  // Build & Verify is traced on the task board by the server: a card opens when the run starts
  // working (not while it waits for the first user choice), closes on success and goes back to
  // To Do when the run stops without finishing. Never allowed to affect the run itself.
  // (a workflow definition loaded from disk always has steps; the guard keeps tracking from ever being the thing that throws)
  const entryStep = workflow.steps?.find((step) => step.id === workflow.entryStep)
  const tracking = await beginWorkflowTracking({
    sessionManager: options.sessionManager,
    sessionId: options.sessionId,
    workflowId: workflow.metadata.id,
    startsWork: Boolean(options.resumeFromStep) || entryStep?.type !== 'user',
  })
  try {
    const result = await executeWorkflow(workflow, options, options.subGroup)
    await tracking.finish(result.finalAction)
    return result
  } catch (error) {
    await tracking.fail(error)
    throw error
  }
}
