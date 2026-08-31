#!/usr/bin/env tsx
/**
 * Compares two eval run JSON files (from run.ts) task by task — the primary
 * way to check whether a harness change actually helped, instead of assuming
 * it did. See Phase 0 of the harness improvement plan.
 *
 * Usage: npx tsx scripts/eval/report.ts <before.json> <after.json>
 */

import { readFile } from 'node:fs/promises'
import type { EvalRun, TaskResult } from './run.js'

function fmtDelta(before: number, after: number): string {
  const delta = after - before
  if (delta === 0) return '±0'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta}`
}

function compareTask(before: TaskResult | undefined, after: TaskResult | undefined): string[] {
  if (!before || !after) {
    return [`  (${!before ? 'new in after' : 'missing from after'})`]
  }
  const lines: string[] = []
  if (before.pass !== after.pass) {
    lines.push(`  pass: ${before.pass ? 'PASS' : 'FAIL'} → ${after.pass ? 'PASS' : 'FAIL'}`)
  }
  lines.push(
    `  llmCalls: ${before.llmCalls} → ${after.llmCalls} (${fmtDelta(before.llmCalls, after.llmCalls)})`,
    `  promptTokens: ${before.promptTokens} → ${after.promptTokens} (${fmtDelta(before.promptTokens, after.promptTokens)})`,
    `  toolCallsFailed: ${before.toolCallsFailed} → ${after.toolCallsFailed} (${fmtDelta(before.toolCallsFailed, after.toolCallsFailed)})`,
    `  compactions: ${before.compactions} → ${after.compactions} (${fmtDelta(before.compactions, after.compactions)})`,
    `  wallTimeMs: ${before.wallTimeMs} → ${after.wallTimeMs} (${fmtDelta(before.wallTimeMs, after.wallTimeMs)})`,
  )
  if (!after.pass && after.detail) lines.push(`  after failure: ${after.detail}`)
  return lines
}

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2)
  if (!beforePath || !afterPath) {
    console.error('Usage: npx tsx scripts/eval/report.ts <before.json> <after.json>')
    process.exit(1)
  }

  const before = JSON.parse(await readFile(beforePath, 'utf-8')) as EvalRun
  const after = JSON.parse(await readFile(afterPath, 'utf-8')) as EvalRun

  const beforeById = new Map(before.tasks.map((t) => [t.id, t]))
  const afterById = new Map(after.tasks.map((t) => [t.id, t]))
  const allIds = [...new Set([...beforeById.keys(), ...afterById.keys()])]

  console.log(`before: ${before.timestamp} (${before.backend}/${before.model})`)
  console.log(`after:  ${after.timestamp} (${after.backend}/${after.model})\n`)

  for (const id of allIds) {
    console.log(id)
    for (const line of compareTask(beforeById.get(id), afterById.get(id))) console.log(line)
    console.log('')
  }

  const beforePassCount = before.tasks.filter((t) => t.pass).length
  const afterPassCount = after.tasks.filter((t) => t.pass).length
  console.log(`pass rate: ${beforePassCount}/${before.tasks.length} → ${afterPassCount}/${after.tasks.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
