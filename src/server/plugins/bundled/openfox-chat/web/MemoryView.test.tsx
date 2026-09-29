// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MemoryEntry } from './memory-client'

const client = vi.hoisted(() => ({
  listMemories: vi.fn(),
  addMemory: vi.fn(),
  updateMemory: vi.fn(),
  forgetMemory: vi.fn(),
  clearMemories: vi.fn(),
  setMemoryEnabled: vi.fn(),
}))

vi.mock('wouter', () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('@/hooks/useT', () => ({ useT: () => (s: { en: string }) => s.en }))
vi.mock('./memory-client', async () => {
  const actual = await vi.importActual<typeof import('./memory-client')>('./memory-client')
  return { ...actual, ...client }
})

import { MemoryView } from './MemoryView'

const entry = (id: string, text: string, tags: string[] = []): MemoryEntry => ({
  id,
  text,
  tags,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
})

beforeEach(() => {
  Object.values(client).forEach((fn) => fn.mockReset())
  client.listMemories.mockResolvedValue({ entries: [entry('a', 'Lives in Lyon', ['home'])], enabled: true })
  client.addMemory.mockResolvedValue({})
  client.updateMemory.mockResolvedValue({})
  client.forgetMemory.mockResolvedValue({})
  client.clearMemories.mockResolvedValue({})
  client.setMemoryEnabled.mockResolvedValue({ enabled: false })
})
afterEach(cleanup)

describe('MemoryView', () => {
  it('lists what is remembered, with tags', async () => {
    render(<MemoryView projectId="p1" />)
    expect(await screen.findByText('Lives in Lyon')).toBeTruthy()
    expect(screen.getByText(/#home/)).toBeTruthy()
    expect(client.listMemories).toHaveBeenCalledWith('p1')
  })

  it('says so when nothing is remembered, and hides the wipe control', async () => {
    client.listMemories.mockResolvedValue({ entries: [], enabled: true })
    render(<MemoryView projectId="p1" />)
    expect(await screen.findByTestId('memory-empty')).toBeTruthy()
    expect(screen.queryByTestId('memory-clear')).toBeNull()
  })

  it('adds a memory with parsed tags, then reloads', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.change(screen.getByTestId('memory-new-text'), { target: { value: 'Prefers metric units' } })
    fireEvent.change(screen.getByPlaceholderText(/tags, comma separated/), { target: { value: 'units, , prefs ' } })
    fireEvent.click(screen.getByTestId('memory-add'))
    await waitFor(() => expect(client.addMemory).toHaveBeenCalledWith('p1', 'Prefers metric units', ['units', 'prefs']))
    await waitFor(() => expect(client.listMemories).toHaveBeenCalledTimes(2))
  })

  it('will not add an empty memory', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    expect((screen.getByTestId('memory-add') as HTMLButtonElement).disabled).toBe(true)
  })

  it('edits a memory in place', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByTestId('memory-edit-text'), { target: { value: 'Lives in Paris' } })
    fireEvent.click(screen.getByTestId('memory-save-edit'))
    await waitFor(() => expect(client.updateMemory).toHaveBeenCalledWith('p1', 'a', 'Lives in Paris', ['home']))
  })

  it('forgets one memory', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.click(screen.getByTestId('memory-forget'))
    await waitFor(() => expect(client.forgetMemory).toHaveBeenCalledWith('p1', 'a'))
  })

  it('wipes everything only after a second, explicit confirmation', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.click(screen.getByTestId('memory-clear'))
    expect(client.clearMemories).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('memory-clear-confirm'))
    await waitFor(() => expect(client.clearMemories).toHaveBeenCalledWith('p1'))
  })

  it('turns memory off and on', async () => {
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.click(screen.getByTestId('memory-enabled'))
    await waitFor(() => expect(client.setMemoryEnabled).toHaveBeenCalledWith('p1', false))
  })

  it('shows the server’s error and keeps the list', async () => {
    client.forgetMemory.mockRejectedValue(new Error('Memory not found'))
    render(<MemoryView projectId="p1" />)
    await screen.findByText('Lives in Lyon')
    fireEvent.click(screen.getByTestId('memory-forget'))
    expect(await screen.findByText('Memory not found')).toBeTruthy()
    expect(screen.getByText('Lives in Lyon')).toBeTruthy()
  })
})
