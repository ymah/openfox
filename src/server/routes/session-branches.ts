import { Router, type Request, type Response } from 'express'
import type { SessionManager } from '../session/manager.js'
import type { Session } from '../../shared/types.js'
import { getCurrentWindowMessages } from '../events/index.js'
import { computeVariants, getBranch, recordBranch } from '../db/session-branches.js'
import { getSessionChatSettings, setSessionChatSettings } from '../db/session-chat-settings.js'
import { serverT } from '../i18n.js'

type BranchDeps = {
  sessionManager: Pick<SessionManager, 'getSession' | 'createSession' | 'forkSession' | 'queueMessage' | 'setMode'>
  toClientSession: (session: Session) => unknown
}

/**
 * Non-destructive regenerate / edit-and-resend.
 *
 * The paths say "versions": `/sessions/:id/branches` already lists a project's git
 * branches. Internally the relationship is still called a branch.
 *
 * `POST /sessions/:id/versions` forks the conversation just before a user message
 * into a new session and re-sends that message there (optionally with new
 * content), so the original reply is kept and the two can be compared with
 * "< 2/3 >". `messageId` may be the user message itself or the assistant reply
 * to regenerate. `GET /sessions/:id/versions` lists the alternatives a session
 * can switch to, keyed by the last message they share.
 */
export function registerSessionBranchRoutes(router: Router, deps: BranchDeps): void {
  const { sessionManager, toClientSession } = deps
  const fail = (res: Response, status: number, en: string, fr: string) =>
    res.status(status).json({ error: serverT({ en, fr }) })

  router.get('/sessions/:id/versions', (req: Request, res: Response) => {
    const id = req.params['id'] as string
    if (!sessionManager.getSession(id)) return fail(res, 404, 'Session not found', 'Session introuvable')
    res.json({ variants: computeVariants(id) })
  })

  router.post('/sessions/:id/versions', (req: Request, res: Response) => {
    const id = req.params['id'] as string
    const session = sessionManager.getSession(id)
    if (!session) return fail(res, 404, 'Session not found', 'Session introuvable')
    if (session.isRunning) return fail(res, 409, 'Session is already running', 'La session est déjà en cours')

    const { messageId, content, attachments } = req.body ?? {}
    if (typeof messageId !== 'string' || !messageId) {
      return fail(res, 400, 'messageId is required', 'messageId est requis')
    }
    if (content !== undefined && (typeof content !== 'string' || !content.trim())) {
      return fail(res, 400, 'content must be a non-empty string if provided', 'content doit être une chaîne non vide')
    }
    if (attachments !== undefined && !Array.isArray(attachments)) {
      return fail(res, 400, 'attachments must be an array if provided', 'attachments doit être un tableau')
    }

    const messages = getCurrentWindowMessages(id)
    const index = messages.findIndex((m) => m.id === messageId)
    if (index === -1) return fail(res, 404, 'Message not found', 'Message introuvable')

    // The user message that produced the reply: the message itself, or the
    // nearest real user message before an assistant reply.
    let userIndex = index
    if (messages[index]!.role !== 'user') {
      while (userIndex >= 0 && !(messages[userIndex]!.role === 'user' && !messages[userIndex]!.isSystemGenerated)) {
        userIndex--
      }
    }
    const userMessage = userIndex >= 0 ? messages[userIndex] : undefined
    if (!userMessage || userMessage.role !== 'user' || userMessage.isSystemGenerated) {
      return fail(res, 400, 'No user message to branch from', 'Aucun message utilisateur à partir duquel bifurquer')
    }

    try {
      const previous = userIndex > 0 ? messages[userIndex - 1]! : null
      const title = session.metadata?.title
      const branch = previous
        ? sessionManager.forkSession(id, previous.id, title)
        : sessionManager.createSession(
            session.projectId,
            title,
            session.providerId,
            session.providerModel,
            session.workspace,
          )
      if (!previous) sessionManager.setMode(branch.id, session.mode)

      // The branch is the same conversation: keep its persona and sampling.
      const settings = getSessionChatSettings(id)
      if (Object.keys(settings).length > 0) setSessionChatSettings(branch.id, settings)

      // Regenerating the same turn of a version makes a sibling of it, not a child:
      // every version of that reply then belongs to one family and shows up together
      // in "< 2/3 >". A later turn of a version starts a family of its own.
      const own = getBranch(id)
      const sameTurn = own !== null && own.prevMessageId === (previous?.id ?? null)
      recordBranch(branch.id, sameTurn ? own.parentSessionId : id, previous?.id ?? null)
      sessionManager.queueMessage(
        branch.id,
        'asap',
        content ?? userMessage.content,
        attachments ?? userMessage.attachments,
        userMessage.messageKind,
      )
      return res.status(201).json({ session: toClientSession(branch) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(message.includes('not found') ? 404 : 500).json({ error: message })
    }
  })
}
