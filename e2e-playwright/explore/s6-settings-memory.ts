import { api, ensureProjects, launch, SHOTS, BASE, findings, note } from './lib.js'
const fx = await ensureProjects()
await api('/api/plugins/openfox-chat/rpc/memory.clear', { json: { params: {}, projectId: fx.chat } })
await api('/api/plugins/openfox-chat/rpc/memory.setEnabled', {
  json: { params: { enabled: true }, projectId: fx.chat },
})
const { browser, page } = await launch('settings-memory')

// --- a) persona & sampling popover
await page.goto(`${BASE}/p/${fx.chat}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('chat-new-conversation').click()
await page.waitForURL(/\/s\//)
await page.waitForLoadState('networkidle')
const sessionUrl = page.url()
console.log('placeholder:', await page.locator('textarea').first().getAttribute('placeholder'))
console.log(
  'criteria panel visible:',
  await page
    .getByText('Acceptance Criteria')
    .isVisible()
    .catch(() => false),
)
await page.getByTestId('chat-settings-button').click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${SHOTS}/60-settings-popover.png` })
await page.getByRole('button', { name: 'Socratic' }).click()
await page.getByTestId('chat-settings-temperature').fill('0.4')
await page.getByTestId('chat-settings-save').click()
await page.waitForTimeout(600)
console.log(
  'popover closed after save:',
  !(await page
    .getByTestId('chat-settings-panel')
    .isVisible()
    .catch(() => false)),
)
console.log(
  'active dot:',
  await page
    .getByTestId('chat-settings-active')
    .isVisible()
    .catch(() => false),
)
await page.reload()
await page.waitForLoadState('networkidle')
await page.waitForTimeout(600)
console.log(
  'active dot after reload:',
  await page
    .getByTestId('chat-settings-active')
    .isVisible()
    .catch(() => false),
)
await page.getByTestId('chat-settings-button').click()
console.log('persona persisted:', (await page.getByTestId('chat-settings-persona').inputValue()).slice(0, 40))
console.log('temperature persisted:', await page.getByTestId('chat-settings-temperature').inputValue())
// out of range
await page.getByTestId('chat-settings-temperature').fill('7')
await page.getByTestId('chat-settings-save').click()
await page.waitForTimeout(300)
console.log(
  'range error shown:',
  await page
    .getByText(/out of range/i)
    .isVisible()
    .catch(() => false),
)
await page.screenshot({ path: `${SHOTS}/61-settings-error.png` })
await page.keyboard.press('Escape')
console.log(
  'escape closes popover:',
  !(await page
    .getByTestId('chat-settings-panel')
    .isVisible()
    .catch(() => false)),
)

// --- b) memory page
await page.goto(`${BASE}/p/${fx.chat}/memory`)
await page.waitForLoadState('networkidle')
await page.waitForTimeout(500)
await page.screenshot({ path: `${SHOTS}/62-memory-empty.png` })
await page.getByTestId('memory-new-text').fill('Vit à Lyon et préfère le système métrique')
await page.getByPlaceholder(/tags, comma separated/).fill('lieu, unités')
await page.getByTestId('memory-add').click()
await page.waitForTimeout(500)
console.log('entries after add:', await page.getByTestId('memory-entry').count())
await page.getByText('Edit', { exact: true }).first().click()
await page.getByTestId('memory-edit-text').fill('Vit à Paris')
await page.getByTestId('memory-save-edit').click()
await page.waitForTimeout(400)
console.log(
  'edited text shown:',
  await page
    .getByText('Vit à Paris')
    .isVisible()
    .catch(() => false),
)
await page.screenshot({ path: `${SHOTS}/63-memory-list.png` })
await page.getByTestId('memory-enabled').click()
await page.waitForTimeout(400)
console.log(
  'enabled after uncheck (api):',
  ((await api(`/api/plugins/openfox-chat/rpc/memory.list`, { json: { params: {}, projectId: fx.chat } })).body as any)
    .result?.enabled,
)
await page.getByTestId('memory-enabled').click()
await page.waitForTimeout(300)
await page.getByTestId('memory-forget').click()
await page.waitForTimeout(400)
console.log(
  'empty again:',
  await page
    .getByTestId('memory-empty')
    .isVisible()
    .catch(() => false),
)
console.log('findings:', findings.join('\n') || 'none')
await browser.close()
