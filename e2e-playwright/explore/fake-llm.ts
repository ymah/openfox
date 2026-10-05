import { appendFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

/** A misbehaving OpenAI-compatible server. The first path segment picks the failure. */
export function startFakeLlm(port: number): Server {
  const server = createServer((req, res) => {
    const mode = req.url?.split('/')[1] ?? 'ok'
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (process.env['FAKE_LLM_LOG'] && req.url?.includes('/chat/completions')) {
        try {
          const parsed = JSON.parse(body) as {
            messages?: { role: string; content?: unknown }[]
            tools?: { function?: { name?: string } }[]
          }
          const text = (c: unknown) => (typeof c === 'string' ? c : JSON.stringify(c ?? '')).replace(/\s+/g, ' ')
          const msgs = parsed.messages ?? []
          const last = msgs[msgs.length - 1]
          const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
          appendFileSync(
            process.env['FAKE_LLM_LOG'],
            JSON.stringify({
              mode,
              system: text(msgs.find((m) => m.role === 'system')?.content).slice(0, 90),
              lastUser: text(lastUser?.content).slice(0, 140),
              lastRole: last?.role,
              lastToolResult: last?.role === 'tool' ? text(last.content).slice(0, 100) : undefined,
              n: msgs.length,
              tools: (parsed.tools ?? []).map((t) => t.function?.name).join(','),
            }) + '\n',
          )
        } catch {}
      }
      if (!req.url?.includes('/chat/completions')) {
        if (req.url?.includes('/models')) {
          res.setHeader('content-type', 'application/json')
          return res.end(JSON.stringify({ data: [{ id: 'fake-model' }] }))
        }
        res.statusCode = 404
        return res.end('{}')
      }
      const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
      const chunk = (content: string, finish: string | null = null) => ({
        id: 'x',
        object: 'chat.completion.chunk',
        created: 0,
        model: 'fake-model',
        choices: [{ index: 0, delta: { content }, finish_reason: finish }],
      })
      if (mode === 'agent') {
        // A cooperative model: finish the step the way the workflow expects, by calling the right tool.
        let tools: string[] = []
        try {
          tools = ((JSON.parse(body) as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
            (t) => t.function?.name ?? '',
          )
        } catch {}
        const toolName = tools.includes('return_value')
          ? 'return_value'
          : tools.includes('step_done')
            ? 'step_done'
            : null
        res.setHeader('content-type', 'text/event-stream')
        res.statusCode = 200
        if (toolName) {
          const args = toolName === 'return_value' ? '{"content":"No findings (fake model).","result":"success"}' : '{}'
          sse({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'fake-model',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: toolName, arguments: args } }],
                },
                finish_reason: null,
              },
            ],
          })
          sse(chunk('', 'tool_calls'))
        } else {
          sse(chunk('Done (fake model).'))
          sse(chunk('', 'stop'))
        }
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      if (mode === 'note') {
        // Notes what the user says "for later" as a card, the way the Planner is told to; then confirms.
        let messages: { role: string; content?: unknown }[] = []
        let tools: string[] = []
        try {
          const parsed = JSON.parse(body) as { messages?: typeof messages; tools?: { function?: { name?: string } }[] }
          messages = parsed.messages ?? []
          tools = (parsed.tools ?? []).map((t) => t.function?.name ?? '')
        } catch {}
        res.setHeader('content-type', 'text/event-stream')
        res.statusCode = 200
        const last = messages[messages.length - 1]
        if (tools.includes('project_tasks') && last?.role !== 'tool') {
          const args = JSON.stringify({
            action: 'create',
            prompt:
              '[bug] Login redirect loses the target page\n\nWhere: login handler. Evidence: user lands on / after signing in. Expected: back to the page they asked for. Verify: sign in from /settings.',
          })
          sse({
            id: 'x',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'fake-model',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { index: 0, id: 'c1', type: 'function', function: { name: 'project_tasks', arguments: args } },
                  ],
                },
                finish_reason: null,
              },
            ],
          })
          sse(chunk('', 'tool_calls'))
        } else {
          sse(chunk('Noted on the board.'))
          sse(chunk('', 'stop'))
        }
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      if (mode === 'http500') {
        res.statusCode = 500
        return res.end('{"error":{"message":"boom"}}')
      }
      if (mode === 'http429') {
        res.statusCode = 429
        res.setHeader('retry-after', '1')
        return res.end('{"error":{"message":"rate"}}')
      }
      if (mode === 'html') {
        res.setHeader('content-type', 'text/html')
        return res.end('<html>proxy error</html>')
      }
      if (mode === 'hang') return // never answer
      res.setHeader('content-type', 'text/event-stream')
      res.statusCode = 200
      if (mode === 'cut') {
        sse(chunk('partial '))
        sse(chunk('answer'))
        return res.destroy()
      }
      if (mode === 'stall') {
        sse(chunk('starts then '))
        return
      } // stalls forever mid-stream
      if (mode === 'garbage') {
        res.write('data: {not json}\n\n')
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      if (mode === 'empty') {
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      if (mode === 'huge') {
        for (let i = 0; i < 400; i++) sse(chunk('lorem ipsum '.repeat(2000)))
        sse(chunk('', 'stop'))
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      if (mode === 'badtool') {
        sse({
          id: 'x',
          object: 'chat.completion.chunk',
          created: 0,
          model: 'fake-model',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path": ' } },
                ],
              },
              finish_reason: null,
            },
          ],
        })
        sse(chunk('', 'tool_calls'))
        res.write('data: [DONE]\n\n')
        return res.end()
      }
      sse(chunk('all good'))
      sse(chunk('', 'stop'))
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  server.listen(port, '127.0.0.1')
  return server
}
