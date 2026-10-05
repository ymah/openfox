import { api, BASE, ensureProjects, note, report, sendAndWait } from './lib.js'
const fx = await ensureProjects()
const title = 'Titre "àé" \n\r injection  <b>x</b> ' + 'é'.repeat(80)
const sid = ((await api('/api/sessions', { json: { projectId: fx.chat, title } })).body as { session: { id: string } })
  .session.id
await sendAndWait(sid, 'Bonjour, ceci est un test d’export 🚀 $5 et $10')
const res = await fetch(`${BASE}/api/sessions/${sid}/export`)
console.log('export', res.status, res.headers.get('content-disposition'))
const payload = await res.json()
const imp = (p: unknown, projectId = fx.dev) => api('/api/sessions/import', { json: { projectId, payload: p } })
const ok = await imp(payload)
console.log('roundtrip import', ok.status)
if (ok.status !== 201) note(`round-trip import failed: ${JSON.stringify(ok.body).slice(0, 150)}`)
const newId = (ok.body as any).session?.id
if (newId) {
  const a = ((await api(`/api/sessions/${sid}`)).body as any).messages as { content: string; role: string }[]
  const b = ((await api(`/api/sessions/${newId}`)).body as any).messages as { content: string; role: string }[]
  const norm = (m: typeof a) => m.filter((x) => x.role !== 'system').map((x) => `${x.role}:${x.content}`)
  const missing = norm(a).filter((x) => !norm(b).includes(x))
  console.log('messages', a.length, '->', b.length, 'missing after import:', missing.length)
  if (missing.length) note(`import lost ${missing.length} messages`)
}
const bad: [string, unknown][] = [
  ['empty object', {}],
  ['wrong format', { ...payload, format: 'x' }],
  ['future version', { ...payload, version: 99 }],
  ['messages not array', { ...payload, messages: 'x' }],
  ['events huge null', { ...payload, events: [null, 5, 'x'] }],
  ['session null', { ...payload, session: null }],
  ['string', 'abc'],
  ['array', []],
  ['number', 7],
]
for (const [name, p] of bad) {
  const r = await imp(p)
  console.log('import', name.padEnd(22), r.status)
  if (r.status >= 500) note(`import ${name} -> ${r.status}`)
  if (r.status === 201 && name !== 'future version') note(`import accepted invalid payload: ${name}`)
}
const unknownProject = await imp(payload, 'nope')
console.log('import unknown project', unknownProject.status)
if (unknownProject.status !== 404) note(`import unknown project -> ${unknownProject.status}`)
console.log('health', (await api('/api/health')).status)
report()
