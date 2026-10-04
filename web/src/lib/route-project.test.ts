import { describe, expect, it } from 'vitest'
import { isProjectMissing } from './route-project'

describe('isProjectMissing', () => {
  it('is missing once the fetch failed and nothing is cached', () => {
    expect(isProjectMissing('p1', undefined, new Error('404'))).toBe(true)
    expect(isProjectMissing('p1', null, 'Failed to load project (404)')).toBe(true)
  })

  it('is missing when the fetch settled with no project (404)', () => {
    expect(isProjectMissing('p1', null, undefined)).toBe(true)
  })

  it('is not missing while it is still loading', () => {
    expect(isProjectMissing('p1', undefined, undefined)).toBe(false)
  })

  it('is not missing when there is data, even if a later refresh failed', () => {
    expect(isProjectMissing('p1', { id: 'p1' }, new Error('network'))).toBe(false)
  })

  it('has nothing to be missing without a project id', () => {
    expect(isProjectMissing(undefined, undefined, new Error('x'))).toBe(false)
  })
})
