import { describe, expect, it } from 'vitest'
import { loadFixtureContent, SAMPLE_SPECIES } from '../fixtures/content'
import { DEFAULT_GEAR_TUNING } from '../../src/domain/gear/GearTuning'
import type { GearItem, RodDefinition } from '../../src/domain/gear/Gear'
import type { FishSpecies } from '../../src/domain/fish/FishSpecies'
import { resolveBiteCompatibility } from '../../src/domain/tackle'

// Phase 9.1: Catchability is soft by default / 物理的不可能だけ hard zero。
// Rod / Reel / Line は species eligibility を決めない。

const content = loadFixtureContent()

const species = (id: string): FishSpecies => {
  const found = content.speciesById[id]

  if (found === undefined) {
    throw new Error(`missing species: ${id}`)
  }

  return found
}

const luresByLength = content.gear
  .filter((item) => item.category === 'lure')
  .sort((left, right) =>
    left.category === 'lure' && right.category === 'lure' ? left.lengthMm - right.lengthMm : 0,
  )
const hooksByStrength = content.gear
  .filter((item) => item.category === 'hook')
  .sort((left, right) =>
    left.category === 'hook' && right.category === 'hook' ? left.strengthKg - right.strengthKg : 0,
  )
const rods = content.gear.filter((item): item is RodDefinition => item.category === 'rod')

const smallestLure = luresByLength[0] as GearItem
const largestLure = luresByLength[luresByLength.length - 1] as GearItem
const smallestHook = hooksByStrength[0] as GearItem
const largestHook = hooksByStrength[hooksByStrength.length - 1] as GearItem
const bait = content.gear.filter((item) => item.category === 'bait')[0] as GearItem
const lightRod = rods.filter((rod) => rod.power === 'L')[0] as GearItem
const heavyRod = rods.filter((rod) => rod.power === 'XH')[0] as GearItem

const fit = (input: {
  readonly speciesId: string
  readonly offering?: GearItem | null
  readonly hook?: GearItem | null
  readonly rod?: GearItem | null
  readonly methodId?: string
}) =>
  resolveBiteCompatibility({
    species: species(input.speciesId),
    offering: input.offering ?? smallestLure,
    hook: input.hook ?? smallestHook,
    rod: input.rod ?? lightRod,
    methodId: input.methodId ?? 'lure',
    tuning: DEFAULT_GEAR_TUNING,
  })

describe('catchability rules', () => {
  it('keeps a poor method / offering nonzero (soft affinity)', () => {
    const poor = fit({
      speciesId: 'pacific-halibut',
      methodId: 'light_lure',
      offering: smallestLure,
    })

    expect(poor.eligible).toBe(true)
    expect(poor.affinityMultiplier).toBeGreaterThan(0)
    expect(poor.affinityMultiplier).toBeLessThan(1)
  })

  it('treats an oversized lure as physically impossible for a small fish', () => {
    const oversized = fit({ speciesId: SAMPLE_SPECIES.small, offering: largestLure })

    expect(oversized.eligible).toBe(false)
    expect(oversized.reason).toBe('offering_too_large')
    expect(oversized.affinityMultiplier).toBe(0)
  })

  it('treats an oversized hook as physically impossible for a small fish', () => {
    const oversized = fit({ speciesId: SAMPLE_SPECIES.small, hook: largestHook })

    expect(oversized.eligible).toBe(false)
    expect(oversized.reason).toBe('hook_too_large')
    expect(oversized.affinityMultiplier).toBe(0)
  })

  it('keeps an undersized lure possible (asymmetric rule)', () => {
    const undersized = fit({ speciesId: 'chinook-salmon', offering: smallestLure })

    expect(undersized.eligible).toBe(true)
    expect(undersized.affinityMultiplier).toBeGreaterThan(0)
  })

  it('keeps an undersized hook possible but worse at holding', () => {
    const undersized = fit({ speciesId: 'chinook-salmon', hook: smallestHook })

    expect(undersized.eligible).toBe(true)
    expect(undersized.affinityMultiplier).toBeGreaterThan(0)
    expect(undersized.hookRetentionMultiplier).toBeLessThan(1)
  })

  it('does not hard-gate a species by rod class', () => {
    const withLightRod = fit({ speciesId: 'chinook-salmon', rod: lightRod })
    const withHeavyRod = fit({ speciesId: 'chinook-salmon', rod: heavyRod })

    expect(withLightRod.eligible).toBe(true)
    expect(withHeavyRod.eligible).toBe(true)
    // Rod は presentation（soft）にだけ効き、eligibility は変えない。
    expect(withLightRod.reason).toBe(withHeavyRod.reason)
  })

  it('keeps a bait (no size data) soft instead of guessing', () => {
    const withBait = fit({
      speciesId: SAMPLE_SPECIES.small,
      offering: bait,
      methodId: 'bait',
    })

    expect(withBait.eligible).toBe(true)
    expect(withBait.reason).toBe('offering_size_unknown')
    expect(withBait.affinityMultiplier).toBeGreaterThan(0)
  })

  it('is deterministic for the same input', () => {
    const first = fit({ speciesId: 'chinook-salmon' })
    const second = fit({ speciesId: 'chinook-salmon' })

    expect(first).toEqual(second)
  })
})
