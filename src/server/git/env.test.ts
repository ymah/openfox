import { afterEach, describe, expect, it } from 'vitest'
import { gitSpawnEnv } from './env.js'

describe('gitSpawnEnv', () => {
  afterEach(() => {
    delete process.env['GIT_DIR']
    delete process.env['GIT_OPTIONAL_LOCKS']
  })

  it('strips inherited repository state', () => {
    process.env['GIT_DIR'] = '/elsewhere/.git'
    expect(gitSpawnEnv()['GIT_DIR']).toBeUndefined()
  })

  it('disables optional locks so background reads never block a checkout', () => {
    process.env['GIT_OPTIONAL_LOCKS'] = '1'
    expect(gitSpawnEnv()['GIT_OPTIONAL_LOCKS']).toBe('0')
  })
})
