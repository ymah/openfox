import { ensureProjects, api, note, findings } from './lib.js'
const fx = await ensureProjects()
await api('/api/plugins/openfox-chat/disable', { method: 'POST', json: {} })
const s = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as {
  session: { id: string; mode: string }
}
console.log('session mode while the chat plugin is OFF:', s.session.mode)
await api(`/api/sessions/${s.session.id}/message`, { json: { content: 'hello' } })
await new Promise((r) => setTimeout(r, 4000))
const d = (await api(`/api/sessions/${s.session.id}`)).body as {
  session: { mode: string }
  messages: { role: string; content: string }[]
}
console.log('mode after a turn:', d.session.mode)
console.log(
  'messages:',
  d.messages.map((m) => `${m.role}: ${m.content.slice(0, 80).replace(/\n/g, ' ')}`),
)
if (d.messages.some((m) => m.role === 'assistant'))
  note('a session of a disabled project function still ran a turn (silently under another agent)')
else console.log('OK: no assistant turn ran under a different agent')
await api('/api/plugins/openfox-chat/enable', { method: 'POST', json: {} })
console.log(
  're-enabled:',
  ((await api('/api/plugins/list')).body as any).plugins.map((p: any) => `${p.id}=${p.enabled}`).join(' '),
)
console.log('findings:', findings.join('\n') || 'none')
