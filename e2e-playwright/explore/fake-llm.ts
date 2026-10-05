import { createServer, type Server } from 'node:http'

/** A misbehaving OpenAI-compatible server. The first path segment picks the failure. */
export function startFakeLlm(port: number): Server {
  const server = createServer((req, res) => {
    const mode = req.url?.split('/')[1] ?? 'ok'
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
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
