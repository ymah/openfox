import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Tests get a throwaway data directory (`OPENFOX_DATA_DIR` in the vitest configs)
 * so nothing they create — worktrees, databases — can land in the developer's real
 * OpenFox data directory. This removes it once the run is over.
 *
 * The path is recomputed here rather than read from the environment: a vitest
 * config's `env` block is applied to the test workers, not to this main process,
 * where a global setup runs. The configs and this file share the same formula,
 * and the config is evaluated in this same process, so `process.pid` matches.
 */
export function testDataDir(): string {
  return join(tmpdir(), `openfox-test-data-${process.pid}`)
}

export default function setup(): () => Promise<void> {
  return async () => {
    await rm(testDataDir(), { recursive: true, force: true })
  }
}
