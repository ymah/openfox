/**
 * Server Shutdown Cleanup E2E Test
 *
 * Verifies the server's close() actually sweeps terminal PTY sessions and LSP
 * servers, not just background processes / dev servers. Both sweep functions
 * (terminalManager.killAll, shutdownAllLspManagers) already existed and were
 * already correct in isolation — they were simply never wired into shutdown,
 * so terminals/LSP servers belonging to still-open sessions survived a
 * graceful server stop as orphaned child processes. A spy-based test avoids
 * depending on a real language server binary being installed in CI.
 */

import { describe, it, expect, vi } from 'vitest'
import { createTestServer, type TestServerHandle } from './utils/index.js'
import { terminalManager } from '../src/server/terminal/manager.js'
import * as lspManagerModule from '../src/server/lsp/manager.js'

describe('Server shutdown cleanup', () => {
  it('sweeps terminal sessions and LSP managers on close()', async () => {
    const server: TestServerHandle = await createTestServer()

    const killAllSpy = vi.spyOn(terminalManager, 'killAll')
    const shutdownAllSpy = vi.spyOn(lspManagerModule, 'shutdownAllLspManagers')

    await server.close()

    expect(killAllSpy).toHaveBeenCalledTimes(1)
    expect(shutdownAllSpy).toHaveBeenCalledTimes(1)

    killAllSpy.mockRestore()
    shutdownAllSpy.mockRestore()
  })
})
