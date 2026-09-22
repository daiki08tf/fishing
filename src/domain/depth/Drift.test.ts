import { describe, expect, it } from 'vitest'
import type { CurrentProfile } from '../fish/profiles'
import { resolveDriftStrength } from './Drift'

const current = (preference: CurrentProfile['preference']): CurrentProfile => ({ preference })

describe('resolveDriftStrength', () => {
  it('treats a missing current profile as slow', () => {
    expect(resolveDriftStrength(undefined)).toBe('slow')
  })

  it('maps none/slow to slow', () => {
    expect(resolveDriftStrength(current('none'))).toBe('slow')
    expect(resolveDriftStrength(current('slow'))).toBe('slow')
  })

  it('maps moderate/any to moderate', () => {
    expect(resolveDriftStrength(current('moderate'))).toBe('moderate')
    expect(resolveDriftStrength(current('any'))).toBe('moderate')
  })

  it('maps strong to fast', () => {
    expect(resolveDriftStrength(current('strong'))).toBe('fast')
  })
})
