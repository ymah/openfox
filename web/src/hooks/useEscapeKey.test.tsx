// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, renderHook } from '@testing-library/react'
import { useEscapeKey } from './useEscapeKey'

describe('useEscapeKey', () => {
  it('calls back on Escape only, and only while enabled', () => {
    const callback = vi.fn()
    const { rerender, unmount } = renderHook(({ enabled }) => useEscapeKey(callback, enabled), {
      initialProps: { enabled: true },
    })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(callback).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).toHaveBeenCalledTimes(1)

    rerender({ enabled: true })
    unmount()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
