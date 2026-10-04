import { PROJECT_MODES } from '../lib/project-modes'
import { useT } from './useT'

/** Translated label of a project function (agent category), or the raw category when unknown. */
export function useFunctionLabel(): (category: string) => string {
  const t = useT()
  return (category) => {
    const mode = PROJECT_MODES.find((m) => m.value === category)
    return mode ? t(mode.label) : category
  }
}
