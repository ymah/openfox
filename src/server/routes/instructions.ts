import { Router } from 'express'
import { importInstructionsFromDirectory } from '../context/instructions.js'
import { resolveLocalDirectory } from './local-directory.js'

export function createInstructionsRoutes(projectDir?: string): Router {
  const router = Router()

  router.post('/import-to-project', async (req, res) => {
    // jscpd:ignore-start — structurally mirrors skills.ts's /import-to-project
    // (same validate-resolve-import-respond shape), but calls a different
    // import function over a different result type; not worth a shared
    // higher-order route factory for two call sites.
    if (!projectDir) return res.status(400).json({ error: 'No active project' })
    const sourcePath = (req.body as { sourcePath?: unknown }).sourcePath
    if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
      return res.status(400).json({ error: 'sourcePath is required' })
    }
    try {
      const resolvedPath = await resolveLocalDirectory(sourcePath)
      const result = await importInstructionsFromDirectory(resolvedPath, projectDir)
      res.json(result)
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Import failed' })
    }
    // jscpd:ignore-end
  })

  return router
}
