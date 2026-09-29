// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const authFetch = vi.fn()
const applyDynamicContext = vi.fn()
vi.mock('../../lib/api', () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }))
vi.mock('../../hooks/useIsTouchDevice', () => ({ useIsTouchDevice: () => false }))
vi.mock('../../stores/session/session-scope', () => ({ useApplyDynamicContext: () => applyDynamicContext }))

import { ChatSettings } from './ChatSettings'

const ok = (settings: unknown) => ({ ok: true, json: () => Promise.resolve({ settings }) })

beforeEach(() => {
  authFetch.mockReset()
  applyDynamicContext.mockReset()
})
afterEach(cleanup)

describe('ChatSettings', () => {
  it('marks the button when the conversation has overrides', async () => {
    authFetch.mockResolvedValue(ok({ temperature: 0.3 }))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(screen.getByTestId('chat-settings-active')).toBeTruthy())
    expect(authFetch).toHaveBeenCalledWith('/api/sessions/s1/chat-settings')
  })

  it('has no marker without overrides', async () => {
    authFetch.mockResolvedValue(ok({}))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(authFetch).toHaveBeenCalled())
    expect(screen.queryByTestId('chat-settings-active')).toBeNull()
  })

  it('saves the filled fields and applies a changed persona to the context', async () => {
    authFetch.mockResolvedValueOnce(ok({}))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('chat-settings-button'))
    fireEvent.change(screen.getByTestId('chat-settings-persona'), { target: { value: 'Be a pirate.' } })
    fireEvent.change(screen.getByTestId('chat-settings-temperature'), { target: { value: '1.2' } })
    authFetch.mockResolvedValueOnce(ok({ temperature: 1.2, systemPrompt: 'Be a pirate.' }))
    fireEvent.click(screen.getByTestId('chat-settings-save'))

    await waitFor(() => expect(applyDynamicContext).toHaveBeenCalledWith(false))
    expect(authFetch).toHaveBeenLastCalledWith(
      '/api/sessions/s1/chat-settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ settings: { temperature: 1.2, systemPrompt: 'Be a pirate.' } }),
      }),
    )
  })

  it('does not touch the context when only sampling changed', async () => {
    authFetch.mockResolvedValueOnce(ok({ systemPrompt: 'Terse.' }))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(screen.getByTestId('chat-settings-active')).toBeTruthy())
    fireEvent.click(screen.getByTestId('chat-settings-button'))
    fireEvent.change(screen.getByTestId('chat-settings-temperature'), { target: { value: '0.5' } })
    authFetch.mockResolvedValueOnce(ok({ systemPrompt: 'Terse.', temperature: 0.5 }))
    fireEvent.click(screen.getByTestId('chat-settings-save'))
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2))
    expect(applyDynamicContext).not.toHaveBeenCalled()
  })

  it('refuses an out-of-range value without calling the server', async () => {
    authFetch.mockResolvedValueOnce(ok({}))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('chat-settings-button'))
    fireEvent.change(screen.getByTestId('chat-settings-temperature'), { target: { value: '9' } })
    fireEvent.click(screen.getByTestId('chat-settings-save'))
    expect(await screen.findByText(/out of range/i)).toBeTruthy()
    expect(authFetch).toHaveBeenCalledTimes(1)
  })

  it('shows the server’s refusal', async () => {
    authFetch.mockResolvedValueOnce(ok({}))
    render(<ChatSettings sessionId="s1" isRunning={false} />)
    await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('chat-settings-button'))
    fireEvent.change(screen.getByTestId('chat-settings-persona'), { target: { value: 'x' } })
    authFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'systemPrompt is limited' }) })
    fireEvent.click(screen.getByTestId('chat-settings-save'))
    expect(await screen.findByText('systemPrompt is limited')).toBeTruthy()
    expect(applyDynamicContext).not.toHaveBeenCalled()
  })
})
