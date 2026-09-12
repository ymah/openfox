import { describe, it, expect } from 'vitest'
import { slugify, nextNumberedSlug, findSlugByTitle } from './utils'

describe('slugify', () => {
  it('lowercases, strips accents, and dashes non-alphanumerics', () => {
    expect(slugify('Le Réveil !')).toBe('le-reveil')
  })
})

describe('nextNumberedSlug', () => {
  it('starts at 01 with no existing siblings', () => {
    expect(nextNumberedSlug([], 'scene')).toBe('01-scene')
  })

  it('picks one past the highest existing numeric prefix', () => {
    expect(nextNumberedSlug(['01-scene', '02-scene'], 'scene')).toBe('03-scene')
  })

  it('is not fooled by insertion order — takes the max, not the count', () => {
    expect(nextNumberedSlug(['01-scene', '05-scene'], 'scene')).toBe('06-scene')
  })
})

describe('findSlugByTitle', () => {
  it('matches an existing slug by its name ignoring the numeric prefix', () => {
    expect(findSlugByTitle(['01-act-one', '02-act-two'], 'Act One')).toBe('01-act-one')
  })

  it('returns undefined when no sibling matches the title', () => {
    expect(findSlugByTitle(['01-act-one'], 'Act Two')).toBeUndefined()
  })
})
