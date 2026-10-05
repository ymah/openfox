import { appendFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

/**
 * A scripted stand-in for the model in an end-to-end scenario. It plays every role of the dev workflow
 * (planner, architect, builder, test runner, verifier, reviewers, security reviewer, audit) with the calls
 * a competent model would make, so the real server, tools, workflow engine and task board run for real.
 * The role is read from the request itself; progress through a role's script is the number of tool calls
 * already made since its last instruction.
 */
export interface ScenarioStep {
  role: string
  step: number
  tool: string
}

type Msg = { role: string; content?: unknown; tool_calls?: { id?: string; function?: { name?: string } }[] }
type Reply = { tool: string; args: Record<string, unknown>; content?: string } | { text: string }

const text = (c: unknown): string => (typeof c === 'string' ? c : JSON.stringify(c ?? ''))

const FLAWED = `export function searchUsers(db, q) {
  return db.query("SELECT id, name FROM users WHERE name LIKE '%" + q + "%'")
}
`
const FIXED = `export function searchUsers(db, q) {
  return db.query('SELECT id, name FROM users WHERE name LIKE ?', ['%' + q + '%'])
}
`

/** Ids of metadata entries in a session_metadata `get` result, whatever its exact layout. */
function idsIn(result: string): string[] {
  return [...result.matchAll(/\bid["':=\s]+["']?([A-Za-z0-9-]{3,})/g)]
    .map((m) => m[1]!)
    .filter((id, i, all) => all.indexOf(id) === i)
}

export function startScenarioLlm(port: number): { server: Server; steps: ScenarioStep[] } {
  const steps: ScenarioStep[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.url?.includes('/models')) {
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ data: [{ id: 'scenario-model' }] }))
      }
      if (!req.url?.includes('/chat/completions')) {
        res.statusCode = 404
        return res.end('{}')
      }
      let messages: Msg[] = []
      let tools: string[] = []
      try {
        const parsed = JSON.parse(body) as { messages?: Msg[]; tools?: { function?: { name?: string } }[] }
        messages = parsed.messages ?? []
        tools = (parsed.tools ?? []).map((t) => t.function?.name ?? '')
      } catch {}

      // The instruction being answered: the last user message that is not a tool result. System reminders
      // and the workflow-start marker are user messages too, but not instructions.
      const isInstruction = (m: Msg) =>
        m.role === 'user' && !/^\s*(<system-reminder>|\{"workflowName")/.test(text(m.content))
      let instrIdx = -1
      for (let i = messages.length - 1; i >= 0; i--)
        if (isInstruction(messages[i]!)) {
          instrIdx = i
          break
        }
      const instr = text(messages[instrIdx]?.content)
      const firstUser = text(messages.find(isInstruction)?.content)
      // A sub-agent starts with a fresh context and is nudged ("you must call return_value…") as it goes, so its
      // progress counts from its first instruction; an agent working in the session counts from its latest one.
      const isSub = tools.includes('return_value')
      const firstInstrIdx = messages.findIndex(isInstruction)
      const after = messages.slice((isSub ? firstInstrIdx : instrIdx) + 1)
      const k = after.filter((m) => m.role === 'assistant').reduce((n, m) => n + (m.tool_calls?.length ?? 0), 0)
      const results = after.filter((m) => m.role === 'tool').map((m) => text(m.content))
      const lastResult = results[results.length - 1] ?? ''

      const role = (() => {
        if (isSub) {
          // Only sub-agents are offered return_value; what they were asked tells which one they are.
          const task = text(messages[firstInstrIdx]?.content)
          if (/exploitable security flaws/.test(task)) return 'security'
          if (/Design review|Review the design of this change|Audit the architecture/.test(task)) return 'architect'
          if (/NEEDS VERIFICATION|Verify each criterion/.test(task)) return 'verifier'
          if (/UX interaction|Review the \*\*git diff\*\*/.test(task)) return 'reviewer'
          if (/^Run test\//.test(task.trim())) return 'test_runner'
          return 'other_sub'
        }
        if (/Add a \/users search endpoint/.test(instr)) return 'planner'
        if (/Implement the task and make sure/.test(instr)) return 'build'
        if (/Continue working on the acceptance criteria/.test(instr)) return 'build_nudge'
        if (/Security Review Findings/.test(instr)) return 'finalize'
        if (/Produce a concise summary/.test(instr)) return 'summarize'
        if (/Write the audit report/.test(instr)) return 'audit_report'
        return 'idle'
      })()

      const card = (type: string, title: string, rest: string) => ({
        action: 'create',
        prompt: `[${type}] ${title}\n\n${rest}`,
      })
      const meta = (a: Record<string, unknown>) => ({ tool: 'session_metadata', args: a })
      const criteriaIds = idsIn(lastResult)

      const script: Record<string, (() => Reply)[]> = {
        planner: [
          () => ({
            tool: 'call_sub_agent',
            args: {
              subAgentType: 'architect',
              prompt: 'Design review: a /users search endpoint with a q parameter, in src/users.ts.',
            },
          }),
          () =>
            meta({
              action: 'add',
              key: 'criteria',
              description: 'GET /users?q=<text> returns the users whose name contains the text, case-insensitive.',
              status: 'pending',
            }),
          () =>
            meta({
              action: 'add',
              key: 'criteria',
              description: 'The search is safe against SQL injection and covered by a test.',
              status: 'pending',
            }),
          () => ({
            tool: 'project_tasks',
            args: card(
              'idée',
              'Paginate the /users results',
              'Where: src/users.ts searchUsers. Why: the endpoint returns every match. Expected: limit and offset parameters with a default page size. Verify: a test that requests page 2.',
            ),
          }),
          () => ({
            tool: 'step_done',
            args: {},
            content: 'Plan ready: two criteria registered. Pagination noted on the board for later.',
          }),
        ],
        architect: [
          () => ({
            tool: 'return_value',
            args: {
              content:
                '**Recommended approach** — add `searchUsers(db, q)` to `src/users.ts` next to the existing queries and call it from the route; keep the query in one place.\n**Boundaries and split** — routing stays in `src/server.ts`, SQL only in `src/users.ts`.\n**Impact on existing code** — none for current callers; new file only.\n**Risks and debt** — user input reaches SQL: use a parameterized query. Pagination will be needed later.',
              result: 'success',
            },
          }),
        ],
        build: [
          () => ({ tool: 'write_file', args: { path: 'src/users.js', content: FLAWED } }),
          () => ({
            tool: 'write_file',
            args: {
              path: 'test/users.test.js',
              content: "// two cases: matches by substring, ignores case\nconsole.log('users.test: ok')\n",
            },
          }),
          () => ({
            tool: 'call_sub_agent',
            args: { subAgentType: 'test_runner', prompt: 'Run test/users.test.js and report only the failures.' },
          }),
          () => meta({ action: 'get', key: 'criteria' }),
          () => meta({ action: 'update', key: 'criteria', id: criteriaIds[0] ?? '1', status: 'completed' }),
          () => meta({ action: 'update', key: 'criteria', id: criteriaIds[1] ?? '2', status: 'completed' }),
          () => ({ tool: 'step_done', args: {}, content: 'Implemented searchUsers and a test.' }),
        ],
        test_runner: [
          () => ({
            tool: 'run_command',
            args: { command: 'node -e "console.log(\'users.test: 2 passed, 0 failed\')"' },
          }),
          () => ({
            tool: 'return_value',
            args: {
              content:
                '**Command** — `node test/users.test.js`\n**Result** — 2 passed, 0 failed, 0 skipped.\n**Failures** — none.',
              result: 'passed',
            },
          }),
        ],
        verifier: [
          () => meta({ action: 'get', key: 'criteria' }),
          () => meta({ action: 'update', key: 'criteria', id: criteriaIds[0] ?? '1', status: 'passed' }),
          () => meta({ action: 'update', key: 'criteria', id: criteriaIds[1] ?? '2', status: 'passed' }),
          () => ({
            tool: 'return_value',
            args: {
              content: 'Both criteria pass: the endpoint matches by substring, a test covers it.',
              result: 'passed',
            },
          }),
        ],
        reviewer: [
          () => ({
            tool: 'return_value',
            args: { content: 'No issues: small, follows the existing style.', result: 'success' },
          }),
        ],
        security: [
          () =>
            meta({
              action: 'add',
              key: 'review_findings',
              description:
                '[security · high] src/users.js:2 — q → SQL injection (string concatenated into LIKE) — an attacker reads or alters any table — use a parameterized query — confidence high',
              status: 'open',
            }),
          () =>
            meta({
              action: 'add',
              key: 'review_findings',
              description:
                '[security · medium] src/errors.js:3 — stack trace returned in the HTTP 500 body — leaks paths and internals to clients — return a generic message and log the stack — confidence high',
              status: 'open',
            }),
          () => ({
            tool: 'return_value',
            args: {
              content:
                '2 findings: 1 high (SQL injection in the new code), 1 medium (existing error handler leaks stack traces).',
              result: 'success',
            },
          }),
        ],
        finalize: [
          () => meta({ action: 'get', key: 'review_findings' }),
          () => ({ tool: 'edit_file', args: { path: 'src/users.js', old_string: FLAWED, new_string: FIXED } }),
          () => meta({ action: 'update', key: 'review_findings', id: criteriaIds[0] ?? '1', status: 'resolved' }),
          () => ({ tool: 'project_tasks', args: { action: 'list', status: 'all' } }),
          () => ({
            tool: 'project_tasks',
            args: card(
              'sécurité',
              'Error handler leaks stack traces to clients',
              'Where: src/errors.js line 3. Evidence: a failing request returns the stack in the 500 body. Expected: a generic message, the stack only in the logs. Verify: force an error and read the response.',
            ),
          }),
          () =>
            meta({
              action: 'update',
              key: 'review_findings',
              id: criteriaIds[1] ?? '2',
              status: 'dismissed',
              description: `[security · medium] src/errors.js:3 — stack trace returned in the HTTP 500 body. Recorded as card ${/[0-9a-f]{8}-[0-9a-f-]{27}/.exec(lastResult)?.[0] ?? '(id unavailable)'}`,
            }),
          () => ({ tool: 'step_done', args: {} }),
        ],
        summarize: [
          () => ({ tool: 'project_tasks', args: { action: 'list', status: 'all' } }),
          () => ({
            tool: 'step_done',
            args: {},
            content:
              '## Summary\n- Added `searchUsers` with a parameterized query and a test.\n- Security review found an SQL injection in the new code (fixed) and a stack-trace leak in existing code (carded).\n\n**What to test**\n1. GET /users?q=ann returns Ann.\n2. GET /users?q=%27%20OR%201=1-- returns nothing.\n\n**Board** — [idée] Paginate the /users results (to do); [sécurité] Error handler leaks stack traces (to do).',
          }),
        ],
        audit_report: [
          () => ({ tool: 'project_tasks', args: { action: 'list' } }),
          () => ({
            tool: 'project_tasks',
            args: card(
              'dette',
              'Query helpers have no tests',
              'Where: src/users.js. Why: only the new function has a test. Expected: tests for each query helper. Verify: run the test suite.',
            ),
          }),
          () => ({
            tool: 'step_done',
            args: {},
            content:
              '## Audit report\n**Security** — the stack-trace leak is already on the board.\n**Architecture** — SQL and routing are separated; query helpers lack tests (carded as [dette]).',
          }),
        ],
      }
      script['build_nudge'] = script['build']!.slice(3)
      script['other_sub'] = [
        () => ({ tool: 'return_value', args: { content: 'Nothing to report.', result: 'success' } }),
      ]

      if (process.env['SCENARIO_LOG']) {
        appendFileSync(
          process.env['SCENARIO_LOG'],
          `${role} k=${k} instr=${JSON.stringify(instr.replace(/\s+/g, ' ').slice(0, 90))} first=${JSON.stringify(firstUser.replace(/\s+/g, ' ').slice(0, 60))}\n`,
        )
      }
      const plan = script[role]
      const step = plan?.[k]
      const reply: Reply = step
        ? step()
        : tools.includes('step_done') && /step_done/.test(instr)
          ? { tool: 'step_done', args: {} }
          : { text: role === 'idle' ? 'Understood.' : 'Done.' }

      res.setHeader('content-type', 'text/event-stream')
      res.statusCode = 200
      const sse = (delta: Record<string, unknown>, finish: string | null = null) =>
        res.write(
          `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'scenario-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
        )

      if ('tool' in reply && tools.includes(reply.tool)) {
        steps.push({ role, step: k, tool: reply.tool })
        if (reply.content) sse({ content: reply.content })
        sse({
          tool_calls: [
            {
              index: 0,
              id: `call_${steps.length}`,
              type: 'function',
              function: { name: reply.tool, arguments: JSON.stringify(reply.args) },
            },
          ],
        })
        sse({}, 'tool_calls')
      } else if ('tool' in reply) {
        // The tool is not offered to this role: finish instead of calling something it cannot.
        steps.push({ role, step: k, tool: `(${reply.tool} not offered)` })
        sse({ content: 'Done.' })
        sse({}, 'stop')
      } else {
        steps.push({ role, step: k, tool: '(text)' })
        sse({ content: reply.text })
        sse({}, 'stop')
      }
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  server.listen(port, '127.0.0.1')
  return { server, steps }
}
