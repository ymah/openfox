import { wsClient } from './ws'
import { useSessionStore } from '../stores/session'

/**
 * Ask the server whether the open session's system prompt (instructions, skills,
 * tools) changed while a settings dialog was open. Without an open session there is
 * nothing to compare — the home page, say — and the server would answer with a
 * NO_SESSION error, so nothing is sent.
 */
export function checkDynamicContext(): void {
  if (!useSessionStore.getState().currentSession) return
  try {
    wsClient.send('context.checkDynamic', {})
  } catch {
    // WS might not be connected
  }
}
