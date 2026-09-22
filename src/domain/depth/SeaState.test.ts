import { describe, expect, it } from 'vitest'
import type { EnvironmentSnapshot } from '../environment'
import { resolveSeaState } from './SeaState'

const snapshotWithWind = (wind: EnvironmentSnapshot['water']['wind']): EnvironmentSnapshot => ({
  date: '2026-05-02',
  month: 5,
  season: 'spring',
  timeOfDay: 'morning',
  weather: 'clear',
  tide: 'high',
  water: {
    kind: 'saltwater',
    temperatureC: 18,
    clarity: 0.7,
    flow: 'moderate',
    wind,
  },
})

describe('resolveSeaState', () => {
  it('maps calm wind to calm sea state', () => {
    expect(resolveSeaState(snapshotWithWind('calm'))).toBe('calm')
  })

  it('maps breezy wind to moderate sea state', () => {
    expect(resolveSeaState(snapshotWithWind('breezy'))).toBe('moderate')
  })

  it('maps strong wind to rough sea state', () => {
    expect(resolveSeaState(snapshotWithWind('strong'))).toBe('rough')
  })
})
