import { launch, SHOTS, BASE } from './lib.js'

const { browser, page } = await launch('create')
await page.goto(BASE)
await page.waitForLoadState('networkidle')
await page.getByRole('tab', { name: 'Chat' }).click()
await page.getByRole('button', { name: 'Open Project' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${SHOTS}/20-open-project-chat-tab.png` })
console.log('buttons:', (await page.locator('button').allTextContents()).map((t) => t.trim()).filter(Boolean))
console.log(
  'inputs:',
  await page
    .locator('input, textarea, select')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder || (e as HTMLInputElement).type)),
)
await browser.close()
