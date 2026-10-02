import { ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('workflows')
await page.goto(`${BASE}/p/${fx.dev}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('create-new-session-button').click()
await page.waitForURL(/\/s\//)
await page.waitForLoadState('networkidle')
// the "more" (⋮) button next to Send
const more = page.locator('button[aria-label*="ore" i], button[title*="ore" i]').first()
console.log(
  'more button:',
  await more.getAttribute('title').catch(() => null),
  await more.getAttribute('aria-label').catch(() => null),
)
await more.click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/90-more-menu.png` })
console.log(
  'menu buttons:',
  (await page.locator('button').allTextContents())
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40),
)
await page.getByRole('button', { name: 'Workflows', exact: true }).click()
await page.waitForTimeout(400)
console.log(
  'workflows in the dev menu:',
  (await page.locator('button').allTextContents()).map((t) => t.trim()).filter((t) => /—|Build|Verify|Manage/.test(t)),
)
await page.screenshot({ path: `${SHOTS}/91-workflows-tab.png` })
await page
  .getByText(/Manage Workflows/i)
  .first()
  .click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${SHOTS}/92-workflows-modal.png` })
console.log('modal text:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 500))
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
