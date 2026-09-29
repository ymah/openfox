import { describe, expect, it } from 'vitest'
import { splitSnippet } from './message-search'

describe('splitSnippet', () => {
  it('alternates plain and matched runs', () => {
    expect(splitSnippet('a \u0001Lyon\u0002 trip to \u0001Lyon\u0002 city')).toEqual([
      { text: 'a ', match: false },
      { text: 'Lyon', match: true },
      { text: ' trip to ', match: false },
      { text: 'Lyon', match: true },
      { text: ' city', match: false },
    ])
  })

  it('handles a match at either end and no match at all', () => {
    expect(splitSnippet('\u0001start\u0002 of it')).toEqual([
      { text: 'start', match: true },
      { text: ' of it', match: false },
    ])
    expect(splitSnippet('no matches here')).toEqual([{ text: 'no matches here', match: false }])
    expect(splitSnippet('')).toEqual([])
  })

  it('keeps markup-looking text as text', () => {
    expect(splitSnippet('<b>\u0001x\u0002</b>')).toEqual([
      { text: '<b>', match: false },
      { text: 'x', match: true },
      { text: '</b>', match: false },
    ])
  })
})
