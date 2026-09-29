import { Router, type Request, type Response } from 'express'
import { searchMessages } from '../db/message-search.js'

/**
 * GET /search/messages?q=…&projectId=…&limit=…&offset=… — full-text search over the
 * messages of every conversation (yours and the assistants'), best match first.
 * Version sessions of a regenerated reply are not listed on their own.
 */
export function registerMessageSearchRoute(router: Router): void {
  router.get('/search/messages', (req: Request, res: Response) => {
    const query = typeof req.query['q'] === 'string' ? req.query['q'] : ''
    const projectId =
      typeof req.query['projectId'] === 'string' && req.query['projectId'] ? req.query['projectId'] : undefined
    const number = (value: unknown, fallback: number) => {
      const parsed = Number(value)
      return Number.isInteger(parsed) ? parsed : fallback
    }
    const hits = searchMessages({
      query,
      ...(projectId ? { projectId } : {}),
      limit: number(req.query['limit'], 20),
      offset: number(req.query['offset'], 0),
    })
    res.json({ hits })
  })
}
