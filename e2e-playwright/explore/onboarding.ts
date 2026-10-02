import { chromium } from '@playwright/test'
import { attachWatchers } from './probe.js'

const BASE = 'http://127.0.0.1:10770'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
attachWatchers(page, 'onboarding')
await page.goto(BASE)
await page.waitForLoadState('networkidle')
await page.getByText('Add Provider').click()
await page.waitForTimeout(500)
await page.screenshot({ path: '/tmp/explore-shots/02-add-provider.png' })
console.log(
  'inputs:',
  await page
    .locator('input, select, textarea')
    .evaluateAll((els) =>
      els.map(
        (e) =>
          `${e.tagName}:${(e as HTMLInputElement).placeholder || (e as HTMLInputElement).name || (e as HTMLInputElement).type}`,
      ),
    ),
)
console.log('buttons:', (await page.locator('button').allTextContents()).map((t) => t.trim()).filter(Boolean))
await browser.close()
