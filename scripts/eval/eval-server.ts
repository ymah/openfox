/**
 * Eval-mode server factory.
 *
 * Deliberately NOT `e2e/utils/server-factory.ts` — that factory hardcodes
 * `OPENFOX_MOCK_LLM=true` (see createTestServer, server-factory.ts:70), which
 * is exactly right for protocol e2e tests and exactly wrong here: the whole
 * point of the eval harness is to measure the harness against a REAL LLM
 * backend, not the mock. Everything else (in-process server, dynamic port,
 * isolated in-memory DB, isolated config file) mirrors that factory.
 */

import type { ServerHandle } from '../../src/server/context.js'
import type { Config } from '../../src/shared/types.js'
import { loadConfig } from '../../src/server/config.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface EvalServerHandle extends ServerHandle {
  url: string
  wsUrl: string
  port: number
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is required to run the eval harness against a real backend. ` +
        `Set OPENFOX_LLM_URL (or OPENFOX_VLLM_URL), OPENFOX_BACKEND and OPENFOX_MODEL_NAME ` +
        `to point at a running OpenAI-compatible endpoint (vLLM, sglang, ollama, llama.cpp).`,
    )
  }
  return value
}

function createEvalConfig(): Config {
  if (process.env['OPENFOX_MOCK_LLM'] === 'true') {
    throw new Error(
      'OPENFOX_MOCK_LLM=true is set in the environment. The eval harness measures behavior ' +
        'against a real backend — unset it (it defeats the entire purpose of this script).',
    )
  }
  // Fail fast rather than silently falling back to config.ts's localhost:8000
  // default, which is almost never the endpoint the caller intended.
  if (!process.env['OPENFOX_LLM_URL'] && !process.env['OPENFOX_VLLM_URL']) {
    requireEnv('OPENFOX_LLM_URL')
  }
  requireEnv('OPENFOX_MODEL_NAME')

  process.env['OPENFOX_DB_PATH'] = ':memory:'
  process.env['OPENFOX_LOG_LEVEL'] = process.env['OPENFOX_LOG_LEVEL'] ?? 'error'
  process.env['OPENFOX_HOST'] = '127.0.0.1'
  process.env['OPENFOX_PORT'] = '0'

  const config = loadConfig()
  config.mode = 'test'
  config.globalConfigPath = join(tmpdir(), `openfox-eval-config-${randomUUID()}.json`)
  return config
}

export async function createEvalServer(): Promise<EvalServerHandle> {
  const { createServerHandle } = await import('../../src/server/index.js')

  const config = createEvalConfig()
  const handle = await createServerHandle(config)
  const { port } = await handle.start(0)

  return {
    ...handle,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    port,
  }
}
