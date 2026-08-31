#!/usr/bin/env tsx
/**
 * Eval harness runner — executes the task suite (tasks.ts) against a REAL
 * LLM backend and scores each task, so changes to the harness (prompts,
 * tools, compaction, ...) can be measured instead of assumed. The existing
 * e2e suite intentionally never does this (OPENFOX_MOCK_LLM=true) — see
 * eval-server.ts for why this script needs its own server factory.
 *
 * Usage:
 *   OPENFOX_LLM_URL=http://localhost:8000/v1 \
 *   OPENFOX_BACKEND=vllm \
 *   OPENFOX_MODEL_NAME=Qwen/Qwen3-Coder-30B \
 *     npx tsx scripts/eval/run.ts [--task id1,id2] [--out path] [--timeout ms]
 *
 * or: npm run eval -- --task fix-failing-test
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createTestClient,
  createTestProject,
  createProject,
  createSession,
  setSessionMode,
  type TestClient,
} from '../../e2e/utils/index.js'
import { getEventStore } from '../../src/server/events/index.js'
import { createEvalServer, type EvalServerHandle } from './eval-server.js'
import { EVAL_TASKS, type EvalTask } from './tasks.js'

const DEFAULT_TASK_TIMEOUT_MS = 180_000

export interface TaskResult {
  id: string
  description: string
  pass: boolean
  detail?: string
  wallTimeMs: number
  llmCalls: number
  promptTokens: number
  completionTokens: number
  toolCallsTotal: number
  toolCallsFailed: number
  compactions: number
  finishReason: string
  error?: string
}

export interface EvalRun {
  timestamp: string
  model: string
  backend: string
  tasks: TaskResult[]
}

function parseArgs(argv: string[]) {
  const args = {
    taskIds: undefined as string[] | undefined,
    out: undefined as string | undefined,
    timeoutMs: DEFAULT_TASK_TIMEOUT_MS,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--task' && argv[i + 1]) {
      args.taskIds = argv[++i]!.split(',').map((s) => s.trim())
    } else if (arg === '--out' && argv[i + 1]) {
      args.out = argv[++i]
    } else if (arg === '--timeout' && argv[i + 1]) {
      args.timeoutMs = Number(argv[++i])
    }
  }
  return args
}

async function runTask(server: EvalServerHandle, task: EvalTask, timeoutMs: number): Promise<TaskResult> {
  const startedAt = Date.now()
  let client: TestClient | undefined
  let projectCleanup: (() => Promise<void>) | undefined

  try {
    const testProject = await createTestProject({ template: 'empty', files: task.files })
    projectCleanup = testProject.cleanup

    client = await createTestClient({ url: server.wsUrl })
    const restProject = await createProject(server.url, { name: task.id, workdir: testProject.path })
    const restSession = await createSession(server.url, { projectId: restProject.id })
    await client.send('session.load', { sessionId: restSession.id })
    await setSessionMode(server.url, restSession.id, task.mode ?? 'builder')

    await client.send('chat.send', { content: task.prompt })
    const response = await client.waitForChatDone(task.timeoutMs ?? timeoutMs)
    const wsEvents = client.allEvents()

    // Read the ground-truth event log directly (in-process server) rather than
    // the WS wire — context.compacted is deliberately not forwarded to clients
    // (ws/protocol.ts:617-619), so this is the only accurate source for it.
    const events = getEventStore().getEvents(restSession.id)
    const compactions = events.filter((e) => e.type === 'context.compacted').length
    const toolCallsFailed = response.toolCalls.filter((tc) => tc.result && tc.result.success === false).length

    // chat.stats streams the cumulative MessageStats (with the per-call
    // breakdown) as each LLM call completes — chat.done's own `stats` field
    // does not carry `llmCalls`, so the last chat.stats event is the source
    // of truth for how many model round-trips this turn actually took.
    const statsEvents = wsEvents.filter((e) => e.type === 'chat.stats')
    const lastStatsPayload = statsEvents.at(-1)?.payload as { stats?: { llmCalls?: unknown[] } } | undefined
    const llmCalls = lastStatsPayload?.stats?.llmCalls?.length ?? 1

    const check = await task.check({ projectDir: testProject.path, response, events: wsEvents })

    return {
      id: task.id,
      description: task.description,
      pass: check.pass,
      ...(check.detail ? { detail: check.detail } : {}),
      wallTimeMs: Date.now() - startedAt,
      llmCalls,
      promptTokens: response.stats?.prefillTokens ?? 0,
      completionTokens: response.stats?.generationTokens ?? 0,
      toolCallsTotal: response.toolCalls.length,
      toolCallsFailed,
      compactions,
      finishReason: response.reason,
    }
  } catch (error) {
    return {
      id: task.id,
      description: task.description,
      pass: false,
      wallTimeMs: Date.now() - startedAt,
      llmCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      toolCallsTotal: 0,
      toolCallsFailed: 0,
      compactions: 0,
      finishReason: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await client?.close()
    await projectCleanup?.()
  }
}

function printSummary(run: EvalRun): void {
  const passCount = run.tasks.filter((t) => t.pass).length
  console.log(`\n${passCount}/${run.tasks.length} tasks passed — ${run.backend}/${run.model}\n`)
  console.log(['id', 'pass', 'llmCalls', 'promptTok', 'complTok', 'toolFail', 'compactions', 'wallMs'].join('\t'))
  for (const t of run.tasks) {
    console.log(
      [
        t.id,
        t.pass ? 'PASS' : 'FAIL',
        t.llmCalls,
        t.promptTokens,
        t.completionTokens,
        t.toolCallsFailed,
        t.compactions,
        t.wallTimeMs,
      ].join('\t'),
    )
    if (!t.pass && (t.detail || t.error)) {
      console.log(`  → ${t.detail ?? t.error}`)
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const tasks = args.taskIds ? EVAL_TASKS.filter((t) => args.taskIds!.includes(t.id)) : EVAL_TASKS
  if (tasks.length === 0) {
    throw new Error(`No tasks matched --task ${args.taskIds?.join(',')}`)
  }

  const server = await createEvalServer()
  const results: TaskResult[] = []
  try {
    for (const task of tasks) {
      console.log(`Running ${task.id}...`)
      results.push(await runTask(server, task, args.timeoutMs))
    }
  } finally {
    await server.close()
  }

  const run: EvalRun = {
    timestamp: new Date().toISOString(),
    model: process.env['OPENFOX_MODEL_NAME'] ?? '',
    backend: process.env['OPENFOX_BACKEND'] ?? '',
    tasks: results,
  }

  printSummary(run)

  const outDir = join(import.meta.dirname, 'results')
  await mkdir(outDir, { recursive: true })
  const outPath = args.out ?? join(outDir, `eval-${run.timestamp.replace(/[:.]/g, '-')}.json`)
  await writeFile(outPath, JSON.stringify(run, null, 2))
  console.log(`\nWrote ${outPath}`)

  if (results.some((r) => !r.pass)) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
