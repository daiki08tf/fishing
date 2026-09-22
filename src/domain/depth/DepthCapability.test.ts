import { describe, expect, it } from 'vitest'
import type { LineDefinition, LureDefinition, ReelDefinition } from '../gear/Gear'
import { asGearId } from '../ids'
import type { FishingZone } from '../world/FishingSpot'
import { depthTargetStatus, resolveDepthCapability } from './DepthCapability'

const lightReel: ReelDefinition = {
  id: asGearId('depth-test-light-reel'),
  category: 'reel',
  name: 'Light Reel',
  price: 1,
  reelType: 'spinning',
  size: 3000,
  gearRatio: 5.2,
  maxDragKg: 8,
  lineCapacity: [{ lineStrengthKg: 4, capacityM: 150 }],
  retrieveCmPerTurn: 75,
  weightG: 220,
  smoothness: 0.6,
  control: 0.55,
}

const heavyReel: ReelDefinition = {
  id: asGearId('depth-test-heavy-reel'),
  category: 'reel',
  name: 'Heavy Jigging Reel',
  price: 1,
  reelType: 'conventional',
  size: 30,
  gearRatio: 6.3,
  maxDragKg: 24,
  lineCapacity: [{ lineStrengthKg: 30, capacityM: 400 }],
  retrieveCmPerTurn: 95,
  weightG: 520,
  smoothness: 0.85,
  control: 0.9,
  windingTorque: 0.9,
}

const lightLine: LineDefinition = {
  id: asGearId('depth-test-light-line'),
  category: 'line',
  name: 'Light Line',
  price: 1,
  lineType: 'nylon',
  strengthKg: 4,
  diameterMm: 0.33,
  stretch: 0.25,
  abrasionResistance: 0.5,
  visibility: 0.4,
  sensitivity: 0.4,
}

const heavyLine: LineDefinition = {
  id: asGearId('depth-test-heavy-line'),
  category: 'line',
  name: 'Heavy PE',
  price: 1,
  lineType: 'pe',
  strengthKg: 30,
  diameterMm: 0.29,
  stretch: 0.03,
  abrasionResistance: 0.8,
  visibility: 0.5,
  sensitivity: 0.95,
}

const lightLure: LureDefinition = {
  id: asGearId('depth-test-light-lure'),
  category: 'lure',
  name: 'Light Lure',
  price: 1,
  lureType: 'jig',
  weightG: 10,
  lengthMm: 60,
  depthRangeM: { min: 0, max: 5 },
  retrieveStyle: 'steady',
  action: 'flutter',
  visualProfile: 'silver',
  targetProfile: ['mid'],
}

const heavyJig: LureDefinition = {
  id: asGearId('depth-test-heavy-jig'),
  category: 'lure',
  name: 'Heavy Jig',
  price: 1,
  lureType: 'jig',
  weightG: 200,
  lengthMm: 140,
  depthRangeM: { min: 0, max: 100 },
  retrieveStyle: 'steady',
  action: 'flutter',
  visualProfile: 'silver',
  targetProfile: ['deep'],
}

describe('resolveDepthCapability', () => {
  it('gives a light shore-adjacent setup a shallow comfortable depth', () => {
    const light = resolveDepthCapability({
      reel: lightReel,
      line: lightLine,
      offering: lightLure,
      platform: 'kayak',
    })

    const heavy = resolveDepthCapability({
      reel: heavyReel,
      line: heavyLine,
      offering: heavyJig,
      platform: 'offshore_boat',
    })

    expect(heavy.comfortableDepthM).toBeGreaterThan(light.comfortableDepthM)
    expect(heavy.maxDepthM).toBeGreaterThan(light.maxDepthM)
  })

  it('never exceeds the hard cap and stays positive', () => {
    const capability = resolveDepthCapability({
      reel: heavyReel,
      line: heavyLine,
      offering: heavyJig,
      platform: 'offshore_boat',
    })

    expect(capability.maxDepthM).toBeLessThanOrEqual(260)
    expect(capability.comfortableDepthM).toBeGreaterThan(0)
    expect(capability.comfortableDepthM).toBeLessThanOrEqual(capability.maxDepthM)
  })

  it('platform affects control and reach even with identical gear', () => {
    const onKayak = resolveDepthCapability({
      reel: heavyReel,
      line: heavyLine,
      offering: heavyJig,
      platform: 'kayak',
    })
    const onOffshoreBoat = resolveDepthCapability({
      reel: heavyReel,
      line: heavyLine,
      offering: heavyJig,
      platform: 'offshore_boat',
    })

    expect(onOffshoreBoat.maxDepthM).toBeGreaterThanOrEqual(onKayak.maxDepthM)
    expect(onOffshoreBoat.control).toBeGreaterThanOrEqual(onKayak.control)
  })

  it('is limited by line capacity minus reserve, not just raw score', () => {
    const shortCapacityLine: LineDefinition = { ...heavyLine, strengthKg: 30 }
    const shortCapacityReel: ReelDefinition = {
      ...heavyReel,
      lineCapacity: [{ lineStrengthKg: 30, capacityM: 40 }],
    }

    const capability = resolveDepthCapability({
      reel: shortCapacityReel,
      line: shortCapacityLine,
      offering: heavyJig,
      platform: 'offshore_boat',
    })

    // capacity(40) - reserve(20) = 20m 上限。素点だけならもっと深く出るはず。
    expect(capability.maxDepthM).toBeLessThanOrEqual(20)
  })
})

describe('depthTargetStatus', () => {
  const capability = resolveDepthCapability({
    reel: heavyReel,
    line: heavyLine,
    offering: heavyJig,
    platform: 'offshore_boat',
  })

  const zoneAt = (min: number, max: number): FishingZone => ({
    id: 'z',
    name: 'zone',
    depthRangeM: { min, max },
    habitatTags: [],
  })

  it('returns comfortable for a zone without depthRangeM', () => {
    const zone: FishingZone = { id: 'z', name: 'zone', habitatTags: [] }
    expect(depthTargetStatus(zone, capability)).toBe('comfortable')
  })

  it('returns unreachable only when maxDepthM cannot reach the zone at all', () => {
    const farBeyond = zoneAt(capability.maxDepthM + 100, capability.maxDepthM + 150)
    expect(depthTargetStatus(farBeyond, capability)).toBe('unreachable')
  })

  it('returns comfortable for a shallow, easy zone', () => {
    expect(depthTargetStatus(zoneAt(0, 5), capability)).toBe('comfortable')
  })
})
