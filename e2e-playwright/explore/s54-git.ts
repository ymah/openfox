import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { api, devProjectOnRepo, note, report } from './lib.js'
const { projectId, dir } = await devProjectOnRepo('git-rel')
const sid = ((await api('/api/sessions', { json: { projectId, title: 'git' } })).body as { session: { id: string } })
  .session.id
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf-8' }).trim()
const expect = (name: string, status: number, ok: number[]) => {
  console.log(name.padEnd(46), status)
  if (!ok.includes(status)) note(`${name}: status ${status}`)
}
const co = (b: unknown) => api(`/api/projects/${projectId}/checkout`, { json: b })
const con = (b: unknown) => api(`/api/projects/${projectId}/checkout-new`, { json: b })
console.log('branches:', JSON.stringify((await api(`/api/projects/${projectId}/branches`)).body).slice(0, 150))
for (const name of [
  'feat/ok',
  'bad name',
  '--force',
  '-b',
  '..',
  'a..b',
  'x;rm -rf /',
  '',
  'main',
  'feat/ok',
  'a'.repeat(300),
  '$(touch /tmp/pwn)',
  '@{-1}',
  'HEAD',
  'refs/heads/x',
]) {
  const r = await con({ branch: name, name })
  console.log(
    'checkout-new',
    JSON.stringify(name.slice(0, 25)).padEnd(30),
    r.status,
    JSON.stringify(r.body).slice(0, 80),
  )
  if (r.status >= 500) note(`checkout-new ${JSON.stringify(name)} -> ${r.status}`)
  if (
    ['bad name', '--force', '-b', '..', 'a..b', 'x;rm -rf /', '$(touch /tmp/pwn)', '@{-1}', 'HEAD'].includes(name) &&
    r.status < 300
  )
    note(`checkout-new accepted unsafe name ${JSON.stringify(name)}`)
}
console.log('current branch:', git('rev-parse', '--abbrev-ref', 'HEAD'))
// dirty tree then switch
writeFileSync(`${dir}/README.md`, 'dirty change\n')
const r1 = await co({ branch: 'main' })
console.log('checkout main with dirty tree', r1.status, JSON.stringify(r1.body).slice(0, 120))
expect('checkout unknown branch', (await co({ branch: 'does-not-exist' })).status, [400, 404, 409])
expect('checkout missing body', (await co({})).status, [400])
expect('checkout non-string', (await co({ branch: { a: 1 } })).status, [400])
expect(
  'session checkout unknown branch',
  (await api(`/api/sessions/${sid}/checkout`, { json: { branch: 'zz' } })).status,
  [400, 404, 409],
)
const pwn = (await import('node:fs')).existsSync('/tmp/pwn')
if (pwn) note('shell injection through branch name created /tmp/pwn')
// workspaces
console.log('workspaces:', JSON.stringify((await api(`/api/projects/${projectId}/workspaces`)).body).slice(0, 150))
expect(
  'switch unknown workspace',
  (await api(`/api/sessions/${sid}/switch-workspace`, { json: { target: 'nope' } })).status,
  [400, 404],
)
expect(
  'delete unknown workspace',
  (await api(`/api/sessions/${sid}/delete-workspace`, { json: { name: 'nope' } })).status,
  [400, 404],
)
expect(
  'delete workspace traversal',
  (await api(`/api/sessions/${sid}/delete-workspace`, { json: { name: '../../etc' } })).status,
  [400, 404],
)
expect(
  'switch workspace traversal',
  (await api(`/api/sessions/${sid}/switch-workspace`, { json: { target: '../..' } })).status,
  [400, 404],
)
// terminal
const t = await api('/api/terminals', { json: { sessionId: sid } })
console.log('terminal create', t.status, JSON.stringify(t.body).slice(0, 100))
const tid = (t.body as { id?: string; terminal?: { id: string } }).id ?? (t.body as any).terminal?.id
if (tid) {
  expect('terminal get', (await api(`/api/terminals/${tid}`)).status, [200])
  expect('terminal delete', (await api(`/api/terminals/${tid}`, { method: 'DELETE' })).status, [200, 204])
  expect('terminal get after delete', (await api(`/api/terminals/${tid}`)).status, [404])
  expect('terminal double delete', (await api(`/api/terminals/${tid}`, { method: 'DELETE' })).status, [200, 204, 404])
}
expect('terminal bad session', (await api('/api/terminals', { json: { sessionId: 'nope' } })).status, [400, 404])
expect(
  'terminal bad cwd',
  (await api('/api/terminals', { json: { sessionId: sid, cwd: '/etc' } })).status,
  [200, 201, 400, 403],
)
report()
