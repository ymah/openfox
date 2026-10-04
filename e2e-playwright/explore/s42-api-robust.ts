import { api, BASE, ensureProjects, note, report } from './lib.js'
const fx = await ensureProjects()
const sess = (await api('/api/sessions', { json: { projectId: fx.chat, title: 'rb' } })).body as {
  session: { id: string }
}
const sid = sess.session.id
const chk = (name: string, status: number, okStatuses: number[]) => {
  console.log(name.padEnd(34), status)
  if (!okStatuses.includes(status)) note(`${name}: unexpected status ${status}`)
}
chk(
  'huge message (8MB)',
  (await api(`/api/sessions/${sid}/message`, { json: { content: 'x'.repeat(8 * 1024 * 1024) } })).status,
  [200, 202, 400, 413],
)
chk('empty message', (await api(`/api/sessions/${sid}/message`, { json: { content: '' } })).status, [400])
chk('non-string content', (await api(`/api/sessions/${sid}/message`, { json: { content: 42 } })).status, [400])
chk(
  'bad attachments',
  (await api(`/api/sessions/${sid}/message`, { json: { content: 'hi', attachments: 'x' } })).status,
  [400],
)
chk(
  'attachment w/o data',
  (await api(`/api/sessions/${sid}/message`, { json: { content: 'hi', attachments: [{}] } })).status,
  [200, 202, 400],
)
const raw = await fetch(`${BASE}/api/sessions/${sid}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{bad',
})
chk('malformed JSON', raw.status, [400])
chk('unknown api route', (await api('/api/nope/zzz')).status, [404])
chk('provider no name', (await api('/api/providers', { json: { url: 'x' } })).status, [400])
chk(
  'provider bad url',
  (await api('/api/providers', { json: { name: 'Bad', url: 'not a url', backend: 'vllm', model: 'm' } })).status,
  [200, 400],
)
const provs = ((await api('/api/providers')).body as { providers: { id: string; name: string }[] }).providers
console.log('providers:', provs.map((p) => p.name).join(', '))
for (const p of provs.filter((p) => p.name === 'Bad')) {
  chk('delete provider', (await api(`/api/providers/${p.id}`, { method: 'DELETE' })).status, [200, 204])
}
chk('delete unknown provider', (await api('/api/providers/nope', { method: 'DELETE' })).status, [404])
chk('activate unknown provider', (await api('/api/providers/nope/activate', { method: 'POST' })).status, [404, 400])
chk('delete unknown session', (await api('/api/sessions/nope', { method: 'DELETE' })).status, [404])
chk('delete unknown project', (await api('/api/projects/nope', { method: 'DELETE' })).status, [404])
chk('GET health after all', (await api('/api/health')).status, [200])
report()
