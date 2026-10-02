import { useEffect } from 'react'

/** Call `callback` when Escape is pressed, while `enabled` (e.g. while a popover is open). */
export function useEscapeKey(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') callback()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [callback, enabled])
}
