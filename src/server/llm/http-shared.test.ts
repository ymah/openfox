import { describe, it, expect } from 'vitest'
import { readResponseLines, postJson, parseCompletionResponse } from './http-shared.js'
import { LLMError } from '../utils/errors.js'

function streamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream)
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = []
  for await (const line of gen) out.push(line)
  return out
}

describe('readResponseLines', () => {
  it('yields each newline-terminated line', async () => {
    const res = streamResponse(['data: {"a":1}\n', 'data: {"b":2}\n'])
    expect(await collect(readResponseLines(res))).toEqual(['data: {"a":1}', 'data: {"b":2}'])
  })

  it('yields the final line even when the stream closes without a trailing newline', async () => {
    // Not every server terminates its last SSE/NDJSON line with '\n' before
    // closing the connection — the final chunk (here, the terminal marker)
    // must not be silently dropped.
    const res = streamResponse(['data: {"a":1}\n', 'data: [DONE]'])
    expect(await collect(readResponseLines(res))).toEqual(['data: {"a":1}', 'data: [DONE]'])
  })

  it('reassembles a multi-byte UTF-8 character split across chunk boundaries', async () => {
    // 'é' is 2 bytes in UTF-8 (0xC3 0xA9) — split it across two enqueued chunks.
    const full = new TextEncoder().encode('data: {"content":"café"}')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(full.slice(0, full.length - 1))
        controller.enqueue(full.slice(full.length - 1))
        controller.close()
      },
    })
    const res = new Response(stream)
    expect(await collect(readResponseLines(res))).toEqual(['data: {"content":"café"}'])
  })

  it('ignores blank lines', async () => {
    const res = streamResponse(['data: a\n', '\n', 'data: b\n'])
    expect(await collect(readResponseLines(res))).toEqual(['data: a', 'data: b'])
  })

  it('throws when the response has no body', async () => {
    const res = new Response(null)
    await expect(collect(readResponseLines(res))).rejects.toThrow(LLMError)
  })
})

describe('postJson', () => {
  it('throws LLMError with the response body on a non-2xx status', async () => {
    const originalFetch = global.fetch
    global.fetch = (async () => new Response('bad request', { status: 400 })) as typeof fetch
    try {
      await expect(postJson('http://example.test', {}, '{}')).rejects.toThrow(/HTTP 400/)
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('parseCompletionResponse', () => {
  it('parses JSON and applies the mapper', async () => {
    const res = new Response(JSON.stringify({ id: 'x' }))
    const result = await parseCompletionResponse(res, (data) => ({ mapped: (data as { id: string }).id }))
    expect(result).toEqual({ mapped: 'x' })
  })

  it('attaches the raw text when returnRaw is set', async () => {
    const res = new Response('{"id":"x"}')
    const result = await parseCompletionResponse(res, (data) => ({ mapped: (data as { id: string }).id }), true)
    expect(result.raw).toBe('{"id":"x"}')
  })

  it('throws LLMError on invalid JSON', async () => {
    const res = new Response('not json')
    await expect(parseCompletionResponse(res, (d) => d)).rejects.toThrow(LLMError)
  })
})
