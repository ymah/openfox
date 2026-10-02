import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const sess = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as { session: { id: string } }
await api(`/api/sessions/${sess.session.id}/message`, { json: { content: 'Bonjour mobile' } })
await new Promise((r) => setTimeout(r, 3500))
const { browser, page } = await launch('mobile', { width: 390, height: 844 })
const pages: [string, string][] = [
  ['home', '/'],
  ['chat-home', `/p/${fx.chat}`],
  ['chat-session', `/p/${fx.chat}/s/${sess.session.id}`],
  ['memory', `/p/${fx.chat}/memory`],
  ['dev-home', `/p/${fx.dev}`],
]
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/110-mobile-${name}.png` })
  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }))
  console.log(name, overflow, overflow.sw > overflow.cw + 1 ? '<-- horizontal overflow' : '')
  if (overflow.sw > overflow.cw + 1) note(`mobile ${name}: horizontal overflow (${overflow.sw}px > ${overflow.cw}px)`)
}
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
