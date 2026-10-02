import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const s = (await api('/api/sessions', { json: { projectId: fx.chat } })).body as { session: { id: string } }
await api(`/api/sessions/${s.session.id}/message`, { json: { content: 'Question initiale' } })
await new Promise((r) => setTimeout(r, 3500))
const { browser, page } = await launch('leftovers')

// 1. update banner
await page.goto(`${BASE}/p/${fx.chat}/s/${s.session.id}`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)
const body = await page.locator('body').innerText()
console.log('update banner present (should be false):', /Update OpenFox/.test(body))
if (/Update OpenFox/.test(body)) note('update banner still shown on a fork build')

// 2. Escape closes the agent menu
await page
  .getByRole('button', { name: /^Assistant/ })
  .first()
  .click()
await page.waitForTimeout(300)
const open = await page
  .getByText('Manage Agents')
  .isVisible()
  .catch(() => false)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const stillOpen = await page
  .getByText('Manage Agents')
  .isVisible()
  .catch(() => false)
console.log('agent menu opened:', open, '| still open after Escape (should be false):', stillOpen)
if (stillOpen) note('Escape does not close the agent menu')

// 3. labels
console.log('sidebar new button:', (await page.getByTestId('sidebar-new-session-button').textContent())?.trim())
console.log('sidebar message count:', (await page.locator('text=/\\d+ messages?/').first().textContent())?.trim())
console.log('plugin nav links (chat):', await page.getByTestId('plugin-nav').locator('a').allTextContents())

// 4. writing nav, reachable from a page and from the project home
await page.goto(`${BASE}/p/${fx.writing}/codex`)
await page.waitForLoadState('networkidle')
console.log(
  'plugin nav links (writing, on codex):',
  await page.getByTestId('plugin-nav').locator('a').allTextContents(),
)
await page.getByTestId('plugin-nav').getByText('Manuscript').click()
await page.waitForTimeout(500)
console.log('after clicking Manuscript:', page.url().replace(BASE, ''))

// 5. edit a user message → new version
await page.goto(`${BASE}/p/${fx.chat}/s/${s.session.id}`)
await page.waitForLoadState('networkidle')
await page.locator('.feed-item', { hasText: 'Question initiale' }).first().hover()
await page.locator('button[title="Edit & resend"]').first().click()
await page.locator('textarea').first().fill('Question modifiée')
await page.getByRole('button', { name: 'Cancel' }).locator('xpath=following-sibling::button').click()
await page.waitForTimeout(8000)
console.log(
  'after edit: on original?',
  page.url().endsWith(s.session.id),
  '| user text:',
  await page.locator('text=Question modifiée').count(),
  '| position:',
  await page
    .getByTestId('branch-position')
    .textContent({ timeout: 2000 })
    .catch(() => '(none)'),
)
await page.screenshot({ path: `${SHOTS}/160-after-edit.png` })
const orig = (await api(`/api/sessions/${s.session.id}`)).body as { messages: { role: string; content: string }[] }
console.log('original still says:', orig.messages.find((m) => m.role === 'user')?.content)
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
