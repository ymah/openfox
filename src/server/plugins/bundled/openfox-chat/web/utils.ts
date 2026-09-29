import type { AgentInfo } from '@/lib/agents-actions'

/** How many conversations the home lists. */
export const RECENT_CONVERSATION_LIMIT = 15

/** The assistants a chat project can start a conversation with, in a stable order. */
export function startableAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((agent) => agent.category === 'chat' && !agent.subagent)
}

interface ConversationSummary {
  id: string
  projectId: string
  title?: string | undefined
  isFavorite: boolean
  updatedAt: string
}

/** This project's conversations: favourites first, then most recently active. */
export function groupRecentConversations<T extends ConversationSummary>(sessions: T[], projectId: string): T[] {
  return sessions
    .filter((session) => session.projectId === projectId)
    .sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    .slice(0, RECENT_CONVERSATION_LIMIT)
}
