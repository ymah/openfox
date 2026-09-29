// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const authFetch = vi.fn()
vi.mock('../lib/api', () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }))
vi.mock('../hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))
vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import { MessageSearchResults } from './MessageSearchResults'

const hit = (over: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  messageId: 'm1',
  role: 'user',
  snippet: 'a trip to \u0001Lyon\u0002 in June',
  title: 'Trip planning',
  projectId: 'p1',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
})
const respond = (hits: unknown[]) => authFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ hits }) })

beforeEach(() => {
  authFetch.mockReset()
})
afterEach(cleanup)

describe('MessageSearchResults', () => {
  it('lists hits with the matched words highlighted and a link to the session', async () => {
    respond([hit()])
    render(<MessageSearchResults query="lyon" include={() => true} />)
    expect(await screen.findByText('Trip planning')).toBeTruthy()
    expect(screen.getByText('Lyon').tagName).toBe('MARK')
    expect(screen.getByText('you')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/p/p1/s/s1')
    expect(authFetch).toHaveBeenCalledWith(expect.stringContaining('/api/search/messages?q=lyon'), expect.anything())
  })

  it('shows only the hits the current tab includes, and reports how many', async () => {
    respond([hit(), hit({ sessionId: 's2', messageId: 'm2', projectId: 'other', title: 'Elsewhere' })])
    const onCount = vi.fn()
    render(<MessageSearchResults query="lyon" include={(id) => id === 'p1'} onCount={onCount} />)
    await screen.findByText('Trip planning')
    expect(screen.queryByText('Elsewhere')).toBeNull()
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(1))
  })

  it('renders nothing without hits, and does not fetch for an empty query', async () => {
    respond([])
    const { container, rerender } = render(<MessageSearchResults query="zzz" include={() => true} />)
    await waitFor(() => expect(authFetch).toHaveBeenCalled())
    expect(container.textContent).toBe('')
    authFetch.mockClear()
    rerender(<MessageSearchResults query="  " include={() => true} />)
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('treats a failing search as no results', async () => {
    authFetch.mockRejectedValue(new Error('offline'))
    const { container } = render(<MessageSearchResults query="lyon" include={() => true} />)
    await new Promise((resolve) => setTimeout(resolve, 30)) // let the rejection settle
    expect(container.textContent).toBe('')
  })

  it('never renders snippet text as markup', async () => {
    respond([hit({ snippet: '<img src=x onerror=alert(1)> \u0001Lyon\u0002' })])
    const { container } = render(<MessageSearchResults query="lyon" include={() => true} />)
    await screen.findByText('Lyon')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
