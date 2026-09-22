import { describe, expect, it } from 'vitest'
import { resolveMarineReadiness } from './MarineReadiness'

describe('resolveMarineReadiness', () => {
  it('shore is always ready regardless of sea state', () => {
    expect(resolveMarineReadiness('shore', 'calm').ok).toBe(true)
    expect(resolveMarineReadiness('shore', 'rough').ok).toBe(true)
  })

  it('kayak is blocked outside calm seas', () => {
    expect(resolveMarineReadiness('kayak', 'calm').ok).toBe(true)
    expect(resolveMarineReadiness('kayak', 'moderate').ok).toBe(false)
    expect(resolveMarineReadiness('kayak', 'rough').ok).toBe(false)
  })

  it('a nearshore boat tolerates moderate seas but not rough', () => {
    expect(resolveMarineReadiness('nearshore_boat', 'calm').ok).toBe(true)
    expect(resolveMarineReadiness('nearshore_boat', 'moderate').ok).toBe(true)
    expect(resolveMarineReadiness('nearshore_boat', 'rough').ok).toBe(false)
  })

  it('an offshore-capable boat handles all sea states in this abstraction', () => {
    expect(resolveMarineReadiness('offshore_boat', 'calm').ok).toBe(true)
    expect(resolveMarineReadiness('offshore_boat', 'moderate').ok).toBe(true)
    expect(resolveMarineReadiness('offshore_boat', 'rough').ok).toBe(true)
  })

  it('gives a reason when blocked', () => {
    const result = resolveMarineReadiness('kayak', 'rough')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })
})
