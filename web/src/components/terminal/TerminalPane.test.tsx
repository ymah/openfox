// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { TerminalPane } from './TerminalPane'

const mockWriteSession = vi.fn()
const mockResizeSession = vi.fn()

vi.mock('../../stores/terminal', () => ({
  useTerminalStore: (
    selector: (state: { writeSession: typeof mockWriteSession; resizeSession: typeof mockResizeSession }) => unknown,
  ) => selector({ writeSession: mockWriteSession, resizeSession: mockResizeSession }),
}))

vi.mock('../../lib/ws', () => ({
  wsClient: {
    subscribe: vi.fn(() => {
      return vi.fn()
    }),
  },
}))

let mockCols = 80
let mockRows = 24

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    options: Record<string, unknown>
    element: HTMLElement | null = null
    constructor(options: Record<string, unknown>) {
      this.options = options
    }
    loadAddon() {}
    open(element: HTMLElement) {
      this.element = element
    }
    onData() {}
    onKey() {}
    write() {}
    resize(cols: number, rows: number) {
      mockCols = cols
      mockRows = rows
    }
    dispose() {}
    get cols() {
      return mockCols
    }
    get rows() {
      return mockRows
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit() {}
    proposeDimensions() {
      return { cols: mockCols, rows: mockRows }
    }
  },
}))

describe('TerminalPane', () => {
  it('component exists', () => {
    expect(TerminalPane).toBeDefined()
  })

  it('removes the container keydown listener it adds on unmount', () => {
    // Scoped to the terminal container node specifically — a bare prototype
    // spy also catches React's own internal root-level event delegation
    // listener, which isn't removed the same way and would false-positive.
    const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener')
    const removeSpy = vi.spyOn(HTMLElement.prototype, 'removeEventListener')

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    flushSync(() => root.render(<TerminalPane sessionId="s1" onClose={() => {}} onEscape={() => {}} />))

    const terminalNode = container.querySelector('[tabindex="0"]')
    expect(terminalNode).toBeTruthy()

    const addedHandlers = addSpy.mock.calls
      .map((args, i) => ({ type: args[0], handler: args[1], instance: addSpy.mock.instances[i] }))
      .filter(({ type, instance }) => type === 'keydown' && instance === terminalNode)
      .map(({ handler }) => handler)
    expect(addedHandlers.length).toBeGreaterThan(0)

    flushSync(() => root.unmount())

    const removedHandlers = removeSpy.mock.calls
      .map((args, i) => ({ type: args[0], handler: args[1], instance: removeSpy.mock.instances[i] }))
      .filter(({ type, instance }) => type === 'keydown' && instance === terminalNode)
      .map(({ handler }) => handler)

    for (const handler of addedHandlers) {
      expect(removedHandlers).toContain(handler)
    }

    addSpy.mockRestore()
    removeSpy.mockRestore()
    document.body.removeChild(container)
  })
})
