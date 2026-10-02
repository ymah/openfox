import { describe, expect, it } from 'vitest'
import { isUpdateAvailable } from './update-check.js'

describe('isUpdateAvailable', () => {
  it('offers an update when the published version differs from a regular build', () => {
    expect(isUpdateAvailable('2.0.150', '2.0.160', {})).toBe(true)
  })

  it('is quiet when versions match', () => {
    expect(isUpdateAvailable('2.0.160', '2.0.160', {})).toBe(false)
  })

  it('never offers a fork build the upstream package, which would replace the fork', () => {
    expect(isUpdateAvailable('2.0.160-fox.4', '2.0.160', {})).toBe(false)
    expect(isUpdateAvailable('2.0.160-fox.4', '2.1.0', {})).toBe(false)
  })

  it('can be turned off for deployments updated another way', () => {
    expect(isUpdateAvailable('2.0.150', '2.0.160', { OPENFOX_DISABLE_AUTO_UPDATE: 'true' })).toBe(false)
  })

  it('says nothing when the latest version could not be determined', () => {
    expect(isUpdateAvailable('2.0.150', 'unknown', {})).toBe(false)
    expect(isUpdateAvailable('2.0.150', '', {})).toBe(false)
  })
})
