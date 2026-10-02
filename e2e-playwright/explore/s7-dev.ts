import { ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('dev')
await page.goto(`${BASE}/p/${fx.dev}`)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: `${SHOTS}/70-dev-home.png` })
console.log('dev home text:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 220))
await page.getByTestId('create-new-session-button').click()
await page.waitForURL(/\/s\//, { timeout: 8000 }).catch(() => note('dev: New Session did not navigate'))
await page.waitForLoadState('networkidle')
await page.waitForTimeout(600)
console.log('placeholder:', await page.locator('textarea').first().getAttribute('placeholder'))
console.log(
  'persona button present (should be false):',
  await page
    .getByTestId('chat-settings-button')
    .isVisible()
    .catch(() => false),
)
console.log(
  'criteria visible (should be true):',
  await page
    .getByText('Acceptance Criteria')
    .first()
    .isVisible()
    .catch(() => false),
)
// agent selector
const agentBtn = page.locator('button', { hasText: /^(Planner|Builder|Assistant)/ }).first()
console.log('agent button text:', (await agentBtn.textContent())?.trim())
await agentBtn.click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SHOTS}/71-dev-agent-menu.png` })
const optionTexts = (
  await page.locator('[role="option"], [role="menuitem"], [data-testid*="agent-option"]').allTextContents()
)
  .map((t) => t.trim())
  .filter(Boolean)
console.log('agent options:', optionTexts)
if (optionTexts.some((t) => /Assistant|Researcher|Tutor|Translator|Editor|Brainstorm/.test(t)))
  note('dev: agent selector lists chat assistants')
await page.keyboard.press('Escape')
// slash menu
await page.locator('textarea').first().fill('/')
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/72-dev-slash.png` })
const slash = await page.locator('body').innerText()
if (/Chat —|Chat -/.test(slash)) note('dev: slash menu lists chat workflows')
if (/GTD —|Écriture —/.test(slash)) note('dev: slash menu lists GTD/writing workflows')
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
