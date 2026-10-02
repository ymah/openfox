import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
// Build a conversation whose assistant reply contains rich content, via export → edit → import.
const s = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as { session: { id: string } }
await api(`/api/sessions/${s.session.id}/message`, { json: { content: 'rich' } })
await new Promise((r) => setTimeout(r, 3500))
const exported = (await api(`/api/sessions/${s.session.id}/export`, { method: 'GET' })).body as {
  events?: { type: string; data: Record<string, unknown> }[]
  [k: string]: unknown
}
const RICH = [
  'Voici la formule : $E = mc^2$ et la somme :',
  '',
  '$$',
  '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
  '$$',
  '',
  "Prix : 5 $ et $10 aujourd'hui.",
  '',
  '```mermaid',
  'graph TD; A[Début] --> B[Fin]',
  '```',
  '',
  '```html',
  '<h1 id="art">Artefact</h1><button onclick="document.title=\'x\'">clic</button>',
  '```',
].join('\n')
let patched = 0
const patchMessages = (messages: Record<string, unknown>[] | undefined) => {
  for (const m of messages ?? []) {
    if (m['role'] !== 'assistant') continue
    m['content'] = RICH
    if (Array.isArray(m['segments'])) m['segments'] = [{ type: 'text', content: RICH }]
    patched++
  }
}
patchMessages((exported as { messages?: Record<string, unknown>[] }).messages)
for (const e of exported.events ?? []) {
  if (e.type === 'turn.snapshot') patchMessages(e.data['messages'] as Record<string, unknown>[])
  if (e.type === 'message.delta' && typeof e.data['content'] === 'string') {
    e.data['content'] = RICH
    patched++
  }
}
console.log('export keys:', Object.keys(exported).slice(0, 8), 'patched deltas:', patched)
const imp = await api('/api/sessions/import', { json: { projectId: fx.chat, payload: exported } })
console.log('import status:', imp.status, JSON.stringify(imp.body).slice(0, 120))
const id = (imp.body as { session?: { id: string } }).session?.id
if (!id) {
  note('could not import a rich conversation: ' + JSON.stringify(imp.body).slice(0, 200))
  process.exit(0)
}
const { browser, page } = await launch('rich')
await page.goto(`${BASE}/p/${fx.chat}/s/${id}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${SHOTS}/140-rich.png` })
console.log(
  'katex nodes:',
  await page.locator('.katex').count(),
  '| display:',
  await page.locator('.katex-display').count(),
)
console.log('mermaid svg:', await page.getByTestId('mermaid-diagram').count())
console.log('artifact toggle:', await page.getByTestId('artifact-toggle').count())
const price = (await page.locator('body').innerText()).includes('$10')
console.log('price kept as text:', price)
if (await page.getByTestId('artifact-toggle').count()) {
  await page.getByTestId('artifact-toggle').first().click()
  await page.waitForTimeout(500)
  const frame = page.frameLocator('[data-testid="artifact-preview"]')
  console.log(
    'preview heading:',
    await frame
      .locator('#art')
      .textContent()
      .catch(() => '(none)'),
  )
  console.log('sandbox attr:', await page.getByTestId('artifact-preview').getAttribute('sandbox'))
  await page.screenshot({ path: `${SHOTS}/141-rich-preview.png` })
}
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
