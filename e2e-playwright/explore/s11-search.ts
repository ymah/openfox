import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
// two conversations with distinctive words
for (const [pid, text] of [
  [fx.chat, 'Parle-moi de la photosynthèse des algues bleues'],
  [fx.dev, 'Refactor the zebra parser module'],
] as const) {
  const s = (await api('/api/sessions', { json: { projectId: pid } })).body as { session: { id: string } }
  await api(`/api/sessions/${s.session.id}/message`, { json: { content: text } })
}
await new Promise((r) => setTimeout(r, 4000))
const { browser, page } = await launch('search')
await page.goto(BASE)
await page.waitForLoadState('networkidle')
for (const tab of ['Dev', 'Chat']) {
  await page.getByRole('tab', { name: tab }).click()
  const box = page.getByPlaceholder(/Search sessions/)
  await box.fill(tab === 'Chat' ? 'photosynthese' : 'zebra')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/100-search-${tab}.png` })
  const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
  console.log(
    tab,
    'has content section:',
    text.includes('IN CONVERSATION TEXT') || text.includes('In conversation text'),
    '| marks:',
    await page.locator('mark').allTextContents(),
  )
  const other = tab === 'Chat' ? 'zebra' : 'photosynth'
  if (text.toLowerCase().includes(other))
    note(`${tab} tab search shows a hit from the other project function (${other})`)
  await box.fill('')
}
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
