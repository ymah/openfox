import { api, ensureProjects, launch, report, SHOTS, BASE, note } from './lib.js'

const fx = await ensureProjects()
const s = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as { session: { id: string } }
await api(`/api/sessions/${s.session.id}/message`, { json: { content: 'Bonjour' } })
await new Promise((r) => setTimeout(r, 3500))
const { browser, page } = await launch('french')
await page.goto(BASE)
await page.waitForLoadState('networkidle')
await page.locator('button[title*="ettings" i]').first().click()
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Display', exact: true }).last().click()
await page.waitForTimeout(400)
await page
  .locator('select')
  .filter({ hasText: 'Automatic' })
  .selectOption({ label: 'Français' })
  .catch(async () => {
    console.log('language options:', await page.locator('select').first().locator('option').allTextContents())
  })
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// English strings that must not survive in French UI (new features first).
const ENGLISH = [
  'Talk to',
  'Recent conversations',
  'Ready-made workflows',
  'New conversation',
  'Persona & sampling',
  'Regenerate',
  'Message the assistant',
  'Assistants may use memory',
  'Nothing remembered',
  'Add a memory',
  'Forget everything',
  'In conversation text',
  'Previous version',
  'Built-in —',
  'Unavailable',
]
const pages: [string, string][] = [
  ['home', '/'],
  ['chat-home', `/p/${fx.chat}`],
  ['chat-session', `/p/${fx.chat}/s/${s.session.id}`],
  ['memory', `/p/${fx.chat}/memory`],
  ['dev-home', `/p/${fx.dev}`],
]
for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${SHOTS}/310-fr-${name}.png` })
  const text = await page.locator('body').innerText()
  const leaked = ENGLISH.filter((e) => text.includes(e))
  console.log(
    name.padEnd(13),
    'lang attr:',
    await page.evaluate(() => document.documentElement.lang),
    '| English leftovers:',
    leaked.length ? leaked : 'none',
  )
  if (leaked.length) note(`${name}: untranslated strings in French: ${leaked.join(', ')}`)
}
report()
await browser.close()
