import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const s = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as { session: { id: string } }
await api(`/api/sessions/${s.session.id}/message`, { json: { content: 'Question initiale' } })
await new Promise((r) => setTimeout(r, 3500))
const { browser, page } = await launch('versions')
const statsCalls: string[] = []
page.on('request', (r) => {
  if (r.url().includes('/stats')) statsCalls.push(r.url())
})
await page.goto(`${BASE}/p/${fx.chat}/s/${s.session.id}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)

// regenerate twice → 3 versions
for (let i = 0; i < 2; i++) {
  await page.getByTestId('chat-regenerate').click()
  await page.waitForTimeout(3500)
}
console.log('position after 2 regenerations:', await page.getByTestId('branch-position').textContent())
await page.getByLabel('Previous version').click()
await page.waitForTimeout(1500)
console.log(
  'after ‹ :',
  await page.getByTestId('branch-position').textContent(),
  '| url session changed:',
  !page.url().endsWith(s.session.id),
)
await page.getByLabel('Previous version').click()
await page.waitForTimeout(1500)
console.log(
  'after ‹‹:',
  await page.getByTestId('branch-position').textContent(),
  '| back on original:',
  page.url().endsWith(s.session.id),
)
await page.screenshot({ path: `${SHOTS}/150-versions-original.png` })

// edit the user message → new version
await page.locator('text=Question initiale').first().hover()
await page.waitForTimeout(300)
const editBtn = page.locator('button[title*="dit" i], button[aria-label*="dit" i]').first()
console.log('edit button found:', await editBtn.count())
if (await editBtn.count()) {
  await editBtn.click({ force: true })
  const ta = page.locator('textarea').first()
  await ta.fill('Question modifiée')
  await page
    .getByRole('button', { name: /Send|Envoyer|Save/ })
    .first()
    .click()
    .catch(() => {})
  await page.waitForTimeout(3500)
  await page.waitForTimeout(2500)
  const cur = page.url().split('/s/')[1]!
  console.log(
    'current session is original:',
    cur === s.session.id,
    '| family:',
    JSON.stringify(((await api(`/api/sessions/${cur}/versions`, { method: 'GET' })).body as any).variants).replace(
      /[0-9a-f]{8}-[0-9a-f-]{27}/g,
      (m: string) => m.slice(0, 4),
    ),
  )
  console.log(
    'after edit, position:',
    await page
      .getByTestId('branch-position')
      .textContent()
      .catch(() => '(none)'),
    '| user text:',
    await page.locator('text=Question modifiée').count(),
  )
}
// stats modal: open and count /stats requests
statsCalls.length = 0
await page
  .getByText(/pp|tg/)
  .first()
  .click()
  .catch(() => {})
await page.waitForTimeout(1500)
console.log('stats requests after opening the stats UI:', statsCalls.length)
if (statsCalls.length > 5) note(`stats modal fired ${statsCalls.length} requests`)
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
