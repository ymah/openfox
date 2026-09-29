import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useT } from '@/hooks/useT'
import { useCurrentProject } from '@/hooks/useCurrentProject'
import { useAgents } from '@/hooks/useAgents'
import { useWorkflows } from '@/hooks/useWorkflows'
import { useSessionStore } from '@/stores/session'
import { authFetch } from '@/lib/api'
import { groupRecentConversations, startableAgents } from './utils'

interface ChatHomeProps {
  projectId: string
}

/**
 * Project home for a `chat`-mode project: start a conversation with the
 * assistant of your choice, pick up a recent one, and see the ready-made
 * workflows. Replaces the plain session list a dev project shows.
 */
export function ChatHome({ projectId }: ChatHomeProps) {
  const t = useT()
  const [, navigate] = useLocation()
  const project = useCurrentProject()
  const { agents } = useAgents(project?.workdir)
  const { workflows } = useWorkflows(project?.workdir)
  const sessions = useSessionStore((state) => state.sessions)
  const listSessions = useSessionStore((state) => state.listSessions)
  const createSession = useSessionStore((state) => state.createSession)
  const resetPendingSessionCreate = useSessionStore((state) => state.resetPendingSessionCreate)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listSessions(projectId)
  }, [projectId, listSessions])

  const assistants = useMemo(() => startableAgents(agents), [agents])
  const conversations = useMemo(() => groupRecentConversations(sessions, projectId), [sessions, projectId])
  const chatWorkflows = useMemo(() => workflows.filter((workflow) => workflow.category === 'chat'), [workflows])

  async function startChat(agentId?: string) {
    if (starting) return
    setStarting(agentId ?? 'default')
    setError(null)
    try {
      const session = await createSession(projectId)
      if (!session)
        throw new Error(t({ en: 'Could not create the conversation', fr: 'Impossible de créer la conversation' }))
      if (agentId && agentId !== session.mode) {
        const res = await authFetch(`/api/sessions/${session.id}/mode`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: agentId }),
        })
        if (!res.ok)
          throw new Error(t({ en: 'Could not select this assistant', fr: 'Impossible de choisir cet assistant' }))
      }
      navigate(`/p/${projectId}/s/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      resetPendingSessionCreate()
      setStarting(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <h2 className="text-2xl font-semibold text-text-primary mb-1">
          {project?.name ?? t({ en: 'Chat', fr: 'Chat' })}
        </h2>
        <p className="text-sm text-text-muted mb-6">
          {t({
            en: 'Start a conversation, or pick up where you left off.',
            fr: 'Démarrez une conversation ou reprenez la dernière.',
          })}
        </p>

        <button
          type="button"
          onClick={() => void startChat()}
          disabled={starting !== null}
          data-testid="chat-new-conversation"
          className="w-full rounded font-medium transition-colors bg-accent-primary/25 text-text-primary hover:bg-accent-primary/40 px-3 py-3 mb-2 disabled:opacity-50"
        >
          {t({ en: 'New conversation', fr: 'Nouvelle conversation' })}
        </button>
        {error && <p className="text-sm text-accent-error mb-2">{error}</p>}

        {assistants.length > 0 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
              {t({ en: 'Talk to…', fr: 'Discuter avec…' })}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {assistants.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => void startChat(agent.id)}
                  disabled={starting !== null}
                  data-testid={`chat-agent-${agent.id}`}
                  className="text-start rounded border border-border bg-bg-secondary hover:bg-bg-tertiary transition-colors p-3 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2 font-medium text-text-primary">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: agent.color ?? 'var(--accent-primary, #0ea5e9)' }}
                    />
                    {agent.name}
                  </span>
                  <span className="block text-xs text-text-muted mt-1">{agent.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
            {t({ en: 'Recent conversations', fr: 'Conversations récentes' })}
          </h3>
          {conversations.length === 0 ? (
            <p className="text-sm text-text-muted">
              {t({ en: 'No conversation yet.', fr: 'Aucune conversation pour le moment.' })}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/p/${projectId}/s/${conversation.id}`}
                    className="flex items-center justify-between gap-3 rounded px-3 py-2 hover:bg-bg-tertiary transition-colors"
                  >
                    <span className="truncate text-text-primary">
                      {conversation.isFavorite && <span aria-hidden="true">★ </span>}
                      {conversation.title || t({ en: 'New conversation', fr: 'Nouvelle conversation' })}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {chatWorkflows.length > 0 && (
          <section className="mt-8">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
              {t({ en: 'Ready-made workflows', fr: 'Workflows prêts à l’emploi' })}
            </h3>
            <ul className="flex flex-col gap-1">
              {chatWorkflows.map((workflow) => (
                <li key={workflow.id} className="px-3 py-1.5">
                  <span className="text-text-primary">{workflow.name}</span>
                  <span className="block text-xs text-text-muted">{workflow.description}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted mt-2">
              {t({
                en: 'Type / in a conversation to launch one.',
                fr: 'Tapez / dans une conversation pour en lancer un.',
              })}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
