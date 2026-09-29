import { Router, type Request, type Response } from 'express'
import type { SessionManager } from '../session/manager.js'
import {
  getSessionChatSettings,
  parseSessionChatSettings,
  setSessionChatSettings,
} from '../db/session-chat-settings.js'
import { serverT } from '../i18n.js'

/**
 * GET/PUT /sessions/:id/chat-settings — per-conversation persona and sampling.
 * PUT replaces the whole object (send {} to reset). A persona change alters the
 * session's instructions, so the session is flagged as needing a context rebase,
 * the same way editing project instructions does.
 */
export function registerSessionChatSettingsRoute(
  router: Router,
  sessionManager: Pick<SessionManager, 'getSession' | 'setDynamicContextChanged'>,
): void {
  const notFound = (res: Response) =>
    res.status(404).json({ error: serverT({ en: 'Session not found', fr: 'Session introuvable' }) })

  router.get('/sessions/:id/chat-settings', (req: Request, res: Response) => {
    const id = req.params['id'] as string
    if (!sessionManager.getSession(id)) return notFound(res)
    res.json({ settings: getSessionChatSettings(id) })
  })

  router.put('/sessions/:id/chat-settings', (req: Request, res: Response) => {
    const id = req.params['id'] as string
    if (!sessionManager.getSession(id)) return notFound(res)
    const parsed = parseSessionChatSettings(req.body?.settings)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    const before = getSessionChatSettings(id).systemPrompt
    setSessionChatSettings(id, parsed.settings)
    if (before !== parsed.settings.systemPrompt) sessionManager.setDynamicContextChanged(id, true)
    res.json({ settings: parsed.settings })
  })
}
