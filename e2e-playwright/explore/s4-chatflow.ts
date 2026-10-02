import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('chatflow')
await page.goto(`${BASE}/p/${fx.chat}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('chat-new-conversation').click()
await page.waitForURL(/\/s\//, { timeout: 8000 }).catch(() => note('New conversation did not navigate to a session'))
await page.waitForLoadState('networkidle')
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/50-chat-session-empty.png` })
console.log('url:', page.url().replace(BASE, ''))
console.log(
  'buttons:',
  (await page.locator('button').allTextContents())
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 40),
)
console.log('textareas:', await page.locator('textarea').count())
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
