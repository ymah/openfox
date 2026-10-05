import { describe, expect, it } from 'vitest'
import { parseFavoriteKeys } from './model-favorites'

describe('parseFavoriteKeys', () => {
  it('reads a list of keys', () => {
    expect(parseFavoriteKeys('["a/b","c/d"]')).toEqual(['a/b', 'c/d'])
  })

  it('drops entries that are not strings', () => {
    expect(parseFavoriteKeys('[1,2,3]')).toEqual([])
    expect(parseFavoriteKeys('["a/b",null,5,{"x":1}]')).toEqual(['a/b'])
  })

  it.each(['', '{', 'null', '{"a":1}', '-1', 'true', '"x"'])('returns an empty list for %j', (raw) => {
    expect(parseFavoriteKeys(raw)).toEqual([])
  })
})
