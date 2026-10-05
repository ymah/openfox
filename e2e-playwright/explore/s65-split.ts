import { api, ensureProjects, launch, note, report, BASE } from './lib.js'
const fx = await ensureProjects()
const ids: string[] = []
for (const t of ['one', 'two'])
  ids.push(((await api('/api/sessions', { json: { projectId: fx.chat, title: t } })).body as any).session.id)
const { browser, page } = await launch('split')
const errs: string[] = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
await page.goto(`${BASE}/`)
const layouts: [string, string | null][] = [
  ['valid two', JSON.stringify({ openSessionIds: ids, focusedSessionId: ids[0] })],
  ['unknown ids', JSON.stringify({ openSessionIds: ['nope', ids[0]], focusedSessionId: 'nope' })],
  ['all unknown', JSON.stringify({ openSessionIds: ['a', 'b'], focusedSessionId: 'a' })],
  ['garbage', '{bad'],
  ['null', 'null'],
  ['ids not array', JSON.stringify({ openSessionIds: 'x', focusedSessionId: 5 })],
  ['ids numbers', JSON.stringify({ openSessionIds: [1, 2, null], focusedSessionId: null })],
  [
    '500 ids',
    JSON.stringify({ openSessionIds: Array.from({ length: 500 }, (_, i) => `s${i}`), focusedSessionId: null }),
  ],
  ['empty', null],
]
for (const [name, value] of layouts) {
  errs.length = 0
  await page.evaluate(
    ([v, ls]) => {
      localStorage.removeItem('openfox:split')
      if (v) localStorage.setItem('openfox:split', v)
      localStorage.setItem('openfox:split:layout', ls ?? 'columns')
    },
    [value, 'columns'] as [string | null, string],
  )
  const t0 = Date.now()
  await page.goto(`${BASE}/split-view`).catch(() => {})
  await page.waitForTimeout(2500)
  const text = (
    await page
      .locator('body')
      .innerText()
      .catch(() => '')
  ).replace(/\s+/g, ' ')
  const spinner = await page.locator('[class*="animate-spin"]').count()
  console.log(name.padEnd(14), `errs ${errs.length}`, `spinner ${spinner}`, `${Date.now() - t0}ms`, text.slice(0, 90))
  if (errs.length) note(`split layout "${name}": ${errs[0]}`)
  if (text.replace(/\s/g, '').length < 30) note(`split layout "${name}": blank page`)
  if (spinner > 0) note(`split layout "${name}": spinner still showing after 2.5s`)
}
// layout mode garbage
await page.evaluate(() => localStorage.setItem('openfox:split:layout', 'diagonal'))
errs.length = 0
await page.goto(`${BASE}/split-view`)
await page.waitForTimeout(1500)
if (errs.length) note(`bad layout mode: ${errs[0]}`)
report()
await browser.close()
process.exit(0)
