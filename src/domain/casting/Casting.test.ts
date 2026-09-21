import { describe, expect, it } from 'vitest'
import type {
  LineDefinition,
  LureDefinition,
  ReelDefinition,
  RodDefinition,
} from '../gear/Gear'
import { SeededRandomSource } from '../rng/SeededRandomSource'
import { asGearId } from '../ids'
import type { FishingZone } from '../world/FishingSpot'
import {
  castTargetStatus,
  resolveCast,
  resolveCastCapability,
  zoneAffinityMultiplier,
} from './Casting'
import { createTestSpecies } from '../../../tests/fixtures/species'

const rod: RodDefinition = {
  id: asGearId('cast-test-rod'),
  category: 'rod',
  name: 'Cast Test Rod',
  price: 1,
  lengthM: 2.7,
  power: 'M',
  action: 'fast',
  minLureWeightG: 8,
  maxLureWeightG: 40,
  recommendedLineMinKg: 3,
  recommendedLineMaxKg: 10,
  weightG: 140,
  sensitivity: 0.7,
  control: 0.7,
  fightingPower: 0.6,
  castingProfile: 0.75,
}

const reel: ReelDefinition = {
  id: asGearId('cast-test-reel'),
  category: 'reel',
  name: 'Cast Test Reel',
  price: 1,
  reelType: 'spinning',
  size: 3000,
  gearRatio: 5.2,
  maxDragKg: 9,
  lineCapacity: [
    { lineStrengthKg: 4, capacityM: 180 },
    { lineStrengthKg: 8, capacityM: 120 },
  ],
  retrieveCmPerTurn: 82,
  weightG: 220,
  smoothness: 0.7,
  control: 0.7,
}

const line: LineDefinition = {
  id: asGearId('cast-test-line'),
  category: 'line',
  name: 'Cast Test Line',
  price: 1,
  lineType: 'pe',
  strengthKg: 4,
  diameterMm: 0.18,
  stretch: 0.08,
  abrasionResistance: 0.6,
  visibility: 0.7,
  sensitivity: 0.85,
}

const lure: LureDefinition = {
  id: asGearId('cast-test-lure'),
  category: 'lure',
  name: 'Cast Test Lure',
  price: 1,
  lureType: 'jig',
  weightG: 24,
  lengthMm: 80,
  depthRangeM: { min: 0, max: 4 },
  retrieveStyle: 'steady',
  action: 'wobble',
  visualProfile: 'silver',
  targetProfile: ['mid'],
}

const zones: readonly FishingZone[] = [
  {
    id: 'near',
    name: '近距離',
    castDistanceM: { min: 0, max: 25 },
    habitatTags: ['shallow'],
  },
  {
    id: 'mid',
    name: '中距離',
    castDistanceM: { min: 25, max: 55 },
    habitatTags: ['open'],
  },
  {
    id: 'far',
    name: '遠距離',
    castDistanceM: { min: 55, max: 90 },
    habitatTags: ['current'],
  },
]

describe('casting', () => {
  it('resolves real gear properties into meter-based capability', () => {
    const capability = resolveCastCapability({
      rod,
      reel,
      line,
      offering: lure,
      methodCastDistance: 0.7,
      skillCastingMultiplier: 1,
      windy: false,
    })

    expect(capability.comfortableDistanceM).toBeGreaterThan(30)
    expect(capability.maxDistanceM).toBeGreaterThan(capability.comfortableDistanceM)
    expect(capability.maxDistanceM).toBeLessThanOrEqual(120)
    expect(capability.precision).toBeGreaterThan(0.5)
  })

  it('wind reduces distance and precision without making casting impossible', () => {
    const calm = resolveCastCapability({
      rod,
      reel,
      line,
      offering: lure,
      methodCastDistance: 0.7,
      skillCastingMultiplier: 1,
      windy: false,
    })
    const windy = resolveCastCapability({
      rod,
      reel,
      line,
      offering: lure,
      methodCastDistance: 0.7,
      skillCastingMultiplier: 1,
      windy: true,
    })

    expect(windy.comfortableDistanceM).toBeLessThan(calm.comfortableDistanceM)
    expect(windy.maxDistanceM).toBeLessThan(calm.maxDistanceM)
    expect(windy.precision).toBeLessThan(calm.precision)
  })

  it('classifies zones by comfortable and maximum distance', () => {
    const capability = {
      comfortableDistanceM: 50,
      maxDistanceM: 70,
      precision: 0.7,
      reserveLineM: 25,
    }

    expect(castTargetStatus(zones[0]!, capability)).toBe('comfortable')
    expect(castTargetStatus(zones[1]!, capability)).toBe('reachable')
    expect(castTargetStatus(zones[2]!, capability)).toBe('marginal')
    expect(
      castTargetStatus(zones[2]!, {
        ...capability,
        maxDistanceM: 50,
      }),
    ).toBe('unreachable')
  })

  it('is deterministic for the same seed and can fall into another zone', () => {
    const capability = {
      comfortableDistanceM: 35,
      maxDistanceM: 62,
      precision: 0.45,
      reserveLineM: 25,
    }

    const first = resolveCast({
      zones,
      targetZoneId: 'far',
      capability,
      random: new SeededRandomSource('cast-seed'),
    })
    const second = resolveCast({
      zones,
      targetZoneId: 'far',
      capability,
      random: new SeededRandomSource('cast-seed'),
    })

    expect(first).toEqual(second)
    expect(first.reachable).toBe(true)

    if (first.reachable) {
      expect(first.actualDistanceM).toBeLessThanOrEqual(capability.maxDistanceM)
      expect(zones.some((zone) => zone.id === first.landedZoneId)).toBe(true)
    }
  })

  it('applies zone affinity independently from species catchability', () => {
    const occurrence = {
      speciesId: createTestSpecies().id,
      basePresence: 0.8,
      zoneAffinity: {
        near: 0.3,
        far: 1.4,
      },
    }

    expect(zoneAffinityMultiplier(occurrence, 'near')).toBe(0.3)
    expect(zoneAffinityMultiplier(occurrence, 'far')).toBe(1.4)
    expect(zoneAffinityMultiplier(occurrence, 'mid')).toBe(1)
  })
})
