import { describe, it, expect } from 'vitest'
import {
  estimateToolResultTokens,
  estimatePromptTokens,
  isContextLengthError,
  CHARS_PER_TOKEN,
  TOOL_MESSAGE_OVERHEAD_TOKENS,
} from './token-budget.js'

describe('estimateToolResultTokens', () => {
  it('returns 0 for no tool messages', () => {
    expect(estimateToolResultTokens([])).toBe(0)
  })

  it('estimates content tokens plus per-message overhead', () => {
    const content = 'a'.repeat(CHARS_PER_TOKEN * 10)
    expect(estimateToolResultTokens([{ content }])).toBe(TOOL_MESSAGE_OVERHEAD_TOKENS + 10)
  })

  it('rounds partial token buckets up per message', () => {
    expect(estimateToolResultTokens([{ content: 'abc' }])).toBe(TOOL_MESSAGE_OVERHEAD_TOKENS + 1)
    expect(estimateToolResultTokens([{ content: 'abcde' }])).toBe(TOOL_MESSAGE_OVERHEAD_TOKENS + 2)
  })

  it('sums estimates across multiple tool messages', () => {
    const a = 'a'.repeat(CHARS_PER_TOKEN * 5)
    const b = 'b'.repeat(CHARS_PER_TOKEN * 7)
    expect(estimateToolResultTokens([{ content: a }, { content: b }])).toBe(2 * TOOL_MESSAGE_OVERHEAD_TOKENS + 12)
  })
})

describe('estimatePromptTokens', () => {
  it('accounts for the "[]" framing of an empty tools array with no messages', () => {
    // systemPrompt '' + tools '[]' = 2 chars → ceil(2/4) = 1 token, no messages
    expect(estimatePromptTokens('', [], [])).toBe(1)
  })

  it('adds the system prompt length to the estimate', () => {
    const systemPrompt = 'a'.repeat(CHARS_PER_TOKEN * 10)
    const base = estimatePromptTokens('', [], [])
    expect(estimatePromptTokens(systemPrompt, [], [])).toBe(base + 10)
  })

  it('estimates a message from its raw content length plus per-message overhead, not JSON.stringify of the array', () => {
    const content = 'a'.repeat(CHARS_PER_TOKEN * 10)
    const base = estimatePromptTokens('', [], [])
    expect(estimatePromptTokens('', [{ content }], [])).toBe(base + TOOL_MESSAGE_OVERHEAD_TOKENS + 10)
  })

  it('does not double-count escaping when a message content is itself quote-dense JSON', () => {
    // Regression test: content that is already JSON (e.g. a grep/file-read
    // tool result) must be counted by its own length, not by re-serializing
    // the whole messages array — which double-escapes every embedded quote
    // and wildly inflates the estimate (the original bug: 183% of context
    // window reported for a request that actually fit). Quote-dense content
    // at realistic size makes the escaping inflation dominate the fixed
    // per-message overhead, so the two estimates clearly diverge.
    const innerJson = '"a",'.repeat(5000) // 20,000 raw chars, 10,000 embedded quotes
    const naiveJsonStringifyEstimate = Math.ceil(
      JSON.stringify([{ role: 'tool', content: innerJson }]).length / CHARS_PER_TOKEN,
    )
    const actual = estimatePromptTokens('', [{ content: innerJson }], [])
    expect(actual).toBeLessThan(naiveJsonStringifyEstimate)
    // Should track the raw content length, not the escaped/re-serialized size
    // (+1 for the empty-tools-array "[]" framing, same as the base case above).
    expect(actual).toBe(TOOL_MESSAGE_OVERHEAD_TOKENS + Math.ceil(innerJson.length / CHARS_PER_TOKEN) + 1)
  })

  it('adds toolCalls argument size, which lives outside content', () => {
    const base = estimatePromptTokens('', [{ content: '' }], [])
    const args = { path: '/foo/bar.ts', content: 'x'.repeat(40) }
    const withToolCall = estimatePromptTokens('', [{ content: '', toolCalls: [{ arguments: args }] }], [])
    expect(withToolCall).toBe(base + Math.ceil(JSON.stringify(args).length / CHARS_PER_TOKEN))
  })

  it('grows with the JSON-serialized size of tool definitions', () => {
    const base = estimatePromptTokens('', [], [])
    const withTools = estimatePromptTokens('', [], [{ name: 'read_file', description: 'reads a file' }])
    expect(withTools).toBeGreaterThan(base)
  })

  it('sums estimates across multiple messages', () => {
    const a = 'a'.repeat(CHARS_PER_TOKEN * 5)
    const b = 'b'.repeat(CHARS_PER_TOKEN * 7)
    const single = estimatePromptTokens('', [{ content: a }], [])
    const both = estimatePromptTokens('', [{ content: a }, { content: b }], [])
    expect(both).toBe(single + TOOL_MESSAGE_OVERHEAD_TOKENS + 7)
  })
})

describe('isContextLengthError', () => {
  it('detects OpenAI-style maximum context length errors', () => {
    expect(
      isContextLengthError(
        "HTTP 400: This model's maximum context length is 128000 tokens. However, you requested 130000 tokens (120000 in the messages, 10000 in the completion).",
      ),
    ).toBe(true)
  })

  it('detects context window and context_length markers', () => {
    expect(isContextLengthError('context window exceeded')).toBe(true)
    expect(isContextLengthError('context_length is too long')).toBe(true)
  })

  it('detects prompt-too-long framing', () => {
    expect(isContextLengthError('Prompt is too long (12345 tokens > 8192 tokens)')).toBe(true)
  })

  it('does not match generic token errors without context framing', () => {
    expect(isContextLengthError('too many tokens')).toBe(false)
    expect(isContextLengthError('maximum output tokens exceeded')).toBe(false)
  })

  it('returns false for unrelated errors and empty input', () => {
    expect(isContextLengthError('Connection refused')).toBe(false)
    expect(isContextLengthError('HTTP 500: internal server error')).toBe(false)
    expect(isContextLengthError(undefined)).toBe(false)
    expect(isContextLengthError('')).toBe(false)
  })
})
