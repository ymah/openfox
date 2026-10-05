import { ensureProjects, launch, note, report, BASE, SHOTS } from './lib.js'
const fx = await ensureProjects()
const { browser, page } = await launch('plugin-crash')
await page.route('**/api/plugins/openfox-writing/rpc/codex.list', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      result: { entries: [null, { type: 'characters', slug: 5, title: {}, tags: 'x', facts: null, body: [] }] },
    }),
  }),
)
await page.goto(`${BASE}/p/${fx.writing}/codex`)
await page.waitForTimeout(2500)
const text = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log(text.slice(0, 260))
const alert = await page.getByTestId('page-error').count()
console.log('error view shown:', alert, '| header still there:', text.includes('OpenFox'))
if (!alert) note('plugin page crash did not show the error view')
await page.screenshot({ path: `${SHOTS}/70-plugin-crash.png` })
// navigate away: app still usable
await page.unrouteAll({ behavior: 'ignoreErrors' })
await page.goto(`${BASE}/p/${fx.writing}/manuscript`)
await page.waitForTimeout(1500)
const t2 = (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
console.log('manuscript page:', t2.slice(0, 120))
if (await page.getByTestId('page-error').count()) note('error view persisted after navigating to another page')
report()
await browser.close()
process.exit(0)
