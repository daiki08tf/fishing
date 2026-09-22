import { describe, expect, it } from 'vitest'
import { asFishSpeciesId } from '../ids'
import type { WorldTime } from '../world/WorldTime'
import {
  pickSummaryEnvironment,
  seasonOf,
  timeOfDayOf,
  waterKindOf,
  type ClimateProfile,
} from './Environment'
import { resolveEnvironment } from './environmentResolver'
import { resolveFishingConditions, speciesEnvironmentMultiplier } from './fishingConditions'
import { searchWater } from './fishFinder'
import { NEUTRAL_FISHING_MODIFIERS } from '../fishing/PlayerFishingModifiers'
import { createTestSpecies } from '../../../tests/fixtures/species'

// Phase 9: Environment は決定論的で、同じ入力なら同じ結果になる。

const climate: ClimateProfile = {
  hemisphere: 'north',
  annualMeanWaterC: 18,
  seasonalSwingC: 9,
  weatherWeights: { clear: 30, cloudy: 30, light_rain: 12, rain: 8, windy: 6 },
  tidePhaseOffset: 0.1,
  tideRange: 'moderate',
}

const at = (month: number, day: number, hour: number): WorldTime => ({
  year: 2026,
  month,
  day,
  hour,
  minute: 0,
})

const environmentAt = (time: WorldTime, environment = 'bay_shore') =>
  resolveEnvironment({ time, climate, regionId: 'test-region', environment })

describe('environment', () => {
  it('is deterministic for the same date, region and spot kind', () => {
    const first = environmentAt(at(6, 10, 6))
    const second = environmentAt(at(6, 10, 6))

    expect(first).toEqual(second)
  })

  it('changes the tide as time advances, and reports no tide in freshwater', () => {
    const early = environmentAt(at(6, 10, 3))
    const later = environmentAt(at(6, 10, 9))

    expect(early.tide).not.toBeNull()
    expect(early.tide === later.tide).toBe(false)
    expect(environmentAt(at(6, 10, 6), 'river').tide).toBeNull()
  })

  it('maps months to seasons and hours to time of day', () => {
    expect(seasonOf(4)).toBe('spring')
    expect(seasonOf(7)).toBe('summer')
    expect(seasonOf(10)).toBe('autumn')
    expect(seasonOf(1)).toBe('winter')
    expect(timeOfDayOf(at(6, 10, 6))).toBe('dawn')
    expect(timeOfDayOf(at(6, 10, 21))).toBe('night')
  })

  it('makes rain increase flow and reduce clarity at a river', () => {
    const rainy = resolveEnvironment({
      time: at(6, 20, 12),
      climate: {
        ...climate,
        weatherWeights: { clear: 0, cloudy: 0, light_rain: 0, rain: 1, windy: 0 },
      },
      regionId: 'test-region',
      environment: 'river',
    })
    const clear = resolveEnvironment({
      time: at(6, 20, 12),
      climate: {
        ...climate,
        weatherWeights: { clear: 1, cloudy: 0, light_rain: 0, rain: 0, windy: 0 },
      },
      regionId: 'test-region',
      environment: 'river',
    })

    expect(rainy.weather).toBe('rain')
    expect(clear.weather).toBe('clear')
    expect(rainy.water.flow).toBe('strong')
    expect(rainy.water.clarity).toBeLessThan(clear.water.clarity)
  })

  it('keeps water kinds content-driven', () => {
    expect(waterKindOf('river')).toBe('freshwater')
    expect(waterKindOf('estuary')).toBe('brackish')
    expect(waterKindOf('offshore')).toBe('saltwater')
    expect(
      pickSummaryEnvironment([{ environment: 'river' }, { environment: 'bay_shore' }]),
    ).toEqual({
      environment: 'bay_shore',
    })
  })

  it('raises the encounter weight in the preferred season and never zeroes it', () => {
    const salmon = createTestSpecies({
      id: asFishSpeciesId('test-salmon'),
      japaneseName: 'テストサケ',
      environmentAffinity: {
        preferredSeasons: ['summer'],
        preferredTimeOfDay: ['dawn'],
        tideAffinity: { rising: 1.2 },
      },
    })

    const summer = speciesEnvironmentMultiplier(salmon, environmentAt(at(7, 5, 6)))
    const winter = speciesEnvironmentMultiplier(salmon, environmentAt(at(1, 5, 12)))

    expect(summer).toBeGreaterThan(winter)
    expect(winter).toBeGreaterThanOrEqual(0.35)
  })

  it('resolves conditions with a summary and knowledge-gated hints', () => {
    const salmon = createTestSpecies({
      id: asFishSpeciesId('test-salmon'),
      japaneseName: 'テストサケ',
      environmentAffinity: { preferredSeasons: ['summer'], preferredTimeOfDay: ['dawn'] },
    })
    const environment = environmentAt(at(7, 5, 6))
    const unknown = resolveFishingConditions({
      environment,
      species: [salmon],
      tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
      hasFishFinder: false,
      searchSign: null,
      knowledgeScore: 0,
    })
    const known = resolveFishingConditions({
      environment,
      species: [salmon],
      tackleModifiers: NEUTRAL_FISHING_MODIFIERS,
      hasFishFinder: true,
      searchSign: 'strong',
      knowledgeScore: 60,
    })

    expect(unknown.notes.length).toBeGreaterThan(2)
    expect(unknown.summary).toBeDefined()
    expect(unknown.speciesHintIds.length).toBeLessThanOrEqual(1)
    expect(known.speciesHintIds).toContain('test-salmon')
    expect(known.biteAffinityMultiplier).toBeGreaterThan(unknown.biteAffinityMultiplier)
  })

  it('gives more detail and stronger signs with a fish finder', () => {
    const salmon = createTestSpecies({
      id: asFishSpeciesId('test-salmon'),
      japaneseName: 'テストサケ',
      environmentAffinity: { preferredSeasons: ['summer'] },
    })
    const environment = environmentAt(at(7, 5, 6))
    const without = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [salmon],
      finder: null,
    })
    const withFinder = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [salmon],
      finder: { detectionDepthM: 80, accuracy: 0.6 },
    })

    expect(without.speciesIds).toEqual([])
    expect(withFinder.speciesIds).toEqual(['test-salmon'])
    expect(withFinder.sign).not.toBe('weak')
    expect(without.depthSignals).toBeNull()
    expect(without.baitActivity).toBeNull()
    expect(withFinder.baitActivity).not.toBeNull()
  })

  it('reads depth-only zones only up to the detection depth (Phase 17B)', () => {
    const environment = environmentAt(at(7, 5, 6))
    const zones = [
      { id: 'mid', name: '中層', depthRangeM: { min: 10, max: 35 }, habitatTags: [] },
      { id: 'bottom', name: '底', depthRangeM: { min: 35, max: 150 }, habitatTags: [] },
    ]

    const shallowFinder = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [],
      finder: { detectionDepthM: 40, accuracy: 0.8 },
      depthZones: zones,
      spotDepthRangeM: { min: 0, max: 150 },
    })

    // 40m までしか見えない finder は、150m まである底 Zone の全容を「不明」のままにする。
    expect(shallowFinder.bottomKnown).toBe(false)
    expect(shallowFinder.depthSignals).not.toBeNull()
    expect(shallowFinder.depthSignals?.length).toBeGreaterThan(0)

    const deepFinder = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [],
      finder: { detectionDepthM: 200, accuracy: 0.9 },
      depthZones: zones,
      spotDepthRangeM: { min: 0, max: 150 },
    })

    expect(deepFinder.bottomKnown).toBe(true)
  })

  it('gives a Knowledge-tiered hint without ever naming an unseen species (Phase 17B)', () => {
    const environment = environmentAt(at(7, 5, 6))
    const low = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [],
      finder: null,
      knowledgeScore: 0,
    })
    const high = searchWater({
      environment,
      regionId: 'test-region',
      spotId: 'test-spot',
      time: at(7, 5, 6),
      species: [],
      finder: null,
      knowledgeScore: 90,
    })

    expect(low.knowledgeHint).not.toBeNull()
    expect(high.knowledgeHint).not.toBeNull()
    expect(low.knowledgeHint).not.toEqual(high.knowledgeHint)
  })
})
