import { ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('send')
await page.goto(`${BASE}/p/${fx.chat}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('chat-new-conversation').click()
await page.waitForURL(/\/s\//)
await page.waitForLoadState('networkidle')
const box = page.locator('textarea').first()
await box.fill('Bonjour, explique-moi la photosynthèse en deux phrases.')
await page.getByRole('button', { name: 'Send' }).click()
// wait for a reply to render (mock LLM)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${SHOTS}/51-after-send.png` })
console.log(
  'regenerate visible:',
  await page
    .getByTestId('chat-regenerate')
    .isVisible()
    .catch(() => false),
)
console.log(
  'message texts:',
  (await page.locator('.feed-item').allTextContents()).map((t) => t.replace(/\s+/g, ' ').slice(0, 120)),
)
// regenerate
if (
  await page
    .getByTestId('chat-regenerate')
    .isVisible()
    .catch(() => false)
) {
  const before = page.url()
  await page.getByTestId('chat-regenerate').click()
  await page.waitForTimeout(500)
  await page
    .waitForURL((u) => u.toString() !== before, { timeout: 6000 })
    .catch(() => note('Regenerate did not navigate to the new version'))
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/52-after-regenerate.png` })
  console.log('after regenerate url changed:', page.url() !== before)
  console.log(
    'branch position:',
    await page
      .getByTestId('branch-position')
      .textContent()
      .catch(() => '(none)'),
  )
}
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
