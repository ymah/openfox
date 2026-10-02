import { chromium, type Page } from '@playwright/test'

const BASE = process.env['EXPLORE_URL'] ?? 'http://127.0.0.1:10770'
const SHOTS = '/tmp/explore-shots'
const findings: string[] = []

export function attachWatchers(page: Page, label: string) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const text = m.text()
      if (!/favicon|Download the React DevTools|sw\.js/.test(text))
        findings.push(`[${label}] console.${m.type()}: ${text.slice(0, 300)}`)
    }
  })
  page.on('pageerror', (e) => findings.push(`[${label}] PAGE ERROR: ${e.message.slice(0, 300)}`))
  page.on('requestfailed', (r) => {
    if (!/\.(woff2?|ico)$/.test(r.url()))
      findings.push(`[${label}] request failed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url()))
      findings.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`)
  })
}

export async function main() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
  attachWatchers(page, 'home')
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${SHOTS}/01-home.png` })
  console.log('title:', await page.title())
  console.log('tabs:', await page.locator('[role="tab"]').allTextContents())
  console.log(
    'buttons:',
    (await page.locator('button').allTextContents())
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 30),
  )
  console.log(findings.join('\n') || 'no findings')
  await browser.close()
}
if (process.argv[1]?.endsWith('probe.ts')) main()
