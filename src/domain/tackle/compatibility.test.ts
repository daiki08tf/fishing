import { describe, expect, it } from 'vitest'
import type { GearItem, RodDefinition } from '../gear/Gear'
import { asGearId } from '../ids'
import {
  GEAR_FIXTURE_IDS,
  gearFixture,
  loadoutFixture,
  methodFixture,
} from '../../../tests/fixtures/gear'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { evaluateCompatibility, resolveGearForLoadout } from './compatibility'
import type { Loadout } from './Loadout'

const gear = gearFixture()
const methods = methodFixture()
const methodOf = (id: string) => {
  const method = methods.find((entry) => entry.id === id)

  if (method === undefined) {
    throw new Error(`unknown method: ${id}`)
  }

  return method
}

const rodWith = (overrides: Partial<RodDefinition>): readonly GearItem[] => {
  const base = gear.find((item) => item.id === GEAR_FIXTURE_IDS.rodBalanced)

  if (base === undefined || base.category !== 'rod') {
    throw new Error('fixture rod is missing')
  }

  return [...gear, { ...base, id: asGearId('test-rod-variant'), ...overrides }]
}

const evaluate = (loadout: Loadout, gearItems: readonly GearItem[] = gear, methodId = 'lure') =>
  evaluateCompatibility({ loadout, gear: gearItems, method: methodOf(methodId) })

/** ロッドとルアー以外で警告が出ない、揃った構成。 */
const balanced = (overrides: Partial<Loadout> = {}): Loadout =>
  loadoutFixture({
    reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
    lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
    offeringId: asGearId(GEAR_FIXTURE_IDS.lureLight),
    ...overrides,
  })

describe('compatibility: rod x lure weight', () => {
  it('rates a lure inside the rod range as excellent', () => {
    const report = evaluate(balanced())

    expect(report.fatal).toBe(false)
    expect(report.level).toBe('excellent')
  })

  it('accepts a lure slightly below the rod range as suboptimal', () => {
    const lightLure = gear.find((item) => item.id === GEAR_FIXTURE_IDS.lureLight)

    if (lightLure === undefined) {
      throw new Error('fixture lure is missing')
    }

    // minLureWeightG = 8 のロッドに 5g。推奨より軽いが、扱える範囲。
    const rods = rodWith({ minLureWeightG: 8, maxLureWeightG: 25 })
    const loadout = balanced({
      offeringId: lightLure.id,
      rodId: asGearId('test-rod-variant'),
    })
    const report = evaluate(loadout, rods)

    expect(report.fatal).toBe(false)
    expect(report.level).toBe('suboptimal')
  })

  it('warns when the lure is just above the rod range', () => {
    // maxLureWeightG = 25 のロッドに 30g（1.3 倍以内）。
    const lures: readonly GearItem[] = [
      ...gear,
      {
        id: asGearId('test-lure-slightly-heavy'),
        category: 'lure',
        name: 'テストルアー 30g',
        price: 1000,
        lureType: 'spoon',
        weightG: 30,
        lengthMm: 70,
        depthRangeM: { min: 1, max: 5 },
        retrieveStyle: 'steady',
        action: 'wobble',
        visualProfile: 'flash',
        targetProfile: [],
      },
    ]
    const loadout = balanced({ offeringId: asGearId('test-lure-slightly-heavy') })
    const report = evaluate(loadout, lures)

    expect(report.fatal).toBe(false)
    expect(report.level).toBe('warning')
  })

  it('treats a lure far outside the rod range as fatal', () => {
    // maxLureWeightG = 7 のフィネスロッドに 45g。危険。
    const loadout = loadoutFixture({
      rodId: asGearId(GEAR_FIXTURE_IDS.rodFinesse),
      offeringId: asGearId(GEAR_FIXTURE_IDS.lureHeavy),
      lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
      leaderId: null,
      hookId: asGearId(GEAR_FIXTURE_IDS.hookSmall),
    })
    const report = evaluate(loadout)

    expect(report.fatal).toBe(true)
    expect(report.score).toBe(0)
    expect(report.issues.some((issue) => issue.level === 'fatal')).toBe(true)
  })
})

describe('compatibility: method x offering', () => {
  it('rejects a lure in a bait-only method', () => {
    const loadout = loadoutFixture({ methodId: 'bait' })
    const report = evaluate(loadout, gear, 'bait')

    expect(report.fatal).toBe(true)
  })

  it('rejects a bait in a lure-only method', () => {
    const loadout = loadoutFixture({
      offeringId: asGearId(GEAR_FIXTURE_IDS.bait),
      methodId: 'lure',
    })
    const report = evaluate(loadout, gear, 'lure')

    expect(report.fatal).toBe(true)
  })

  it('rejects a lure the method does not list', () => {
    // light_lure は minnow / spoon だけを認める。
    const loadout = loadoutFixture({
      offeringId: asGearId(GEAR_FIXTURE_IDS.lureHeavy),
      methodId: 'light_lure',
    })
    const report = evaluate(loadout, gear, 'light_lure')

    expect(report.fatal).toBe(true)
  })
})

describe('compatibility: line and reel', () => {
  /** 45g のジグを扱えるパワーロッド。ロッド重量域で fatal にならない構成。 */
  const powerRod = (overrides: Partial<Loadout> = {}): Loadout =>
    loadoutFixture({ rodId: asGearId(GEAR_FIXTURE_IDS.rodPower), ...overrides })

  it('warns when the line is much stronger than the reel drag', () => {
    const loadout = powerRod({
      reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
      lineId: asGearId(GEAR_FIXTURE_IDS.lineHeavy),
    })
    const report = evaluate(loadout)

    expect(report.fatal).toBe(false)
    expect(report.issues.some((issue) => issue.message.includes('ドラッグ'))).toBe(true)
  })

  it('warns when the line is thicker than the reel expects', () => {
    const loadout = powerRod({ lineId: asGearId(GEAR_FIXTURE_IDS.lineHeavy) })
    const report = evaluate(loadout)

    expect(report.issues.some((issue) => issue.message.includes('太い'))).toBe(true)
  })

  it('reports a missing leader as no issue at all', () => {
    const loadout = powerRod({ leaderId: null })
    const report = evaluate(loadout)

    expect(report.fatal).toBe(false)
  })
})

describe('compatibility: hook x species', () => {
  it('warns when the hook is too small for a large species', () => {
    const loadout = loadoutFixture({
      rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
      hookId: asGearId(GEAR_FIXTURE_IDS.hookSmall),
    })
    const species = createTestSpecies({
      lengthModel: {
        kind: 'normal',
        meanCm: 60,
        standardDeviationCm: 6,
        minCm: 40,
        maxCm: 80,
      },
    })
    const report = evaluateCompatibility({
      loadout,
      gear,
      method: methodOf('lure'),
      species,
    })

    expect(report.fatal).toBe(false)
    expect(report.issues.some((issue) => issue.message.includes('フックが小さい'))).toBe(true)
  })

  it('warns when the hook is too large for a small species', () => {
    const loadout = balanced({ hookId: asGearId(GEAR_FIXTURE_IDS.hookLarge) })
    const species = createTestSpecies({
      lengthModel: {
        kind: 'normal',
        meanCm: 12,
        standardDeviationCm: 2,
        minCm: 6,
        maxCm: 18,
      },
    })
    const report = evaluateCompatibility({
      loadout,
      gear,
      method: methodOf('lure'),
      species,
    })

    expect(report.fatal).toBe(false)
    expect(report.issues.some((issue) => issue.message.includes('大きすぎる'))).toBe(true)
  })
})

describe('resolveGearForLoadout', () => {
  it('returns null when a required gear is unknown', () => {
    const loadout = loadoutFixture({ rodId: asGearId('missing-rod') })

    expect(resolveGearForLoadout(loadout, gear)).toBeNull()
  })

  it('returns null when a slot holds the wrong category', () => {
    const loadout = loadoutFixture({ rodId: asGearId(GEAR_FIXTURE_IDS.reelPower) })

    expect(resolveGearForLoadout(loadout, gear)).toBeNull()
  })

  it('accepts a loadout without a leader', () => {
    const resolved = resolveGearForLoadout(loadoutFixture({ leaderId: null }), gear)

    expect(resolved?.leader).toBeNull()
  })
})

describe('compatibility: missing gear', () => {
  it('is fatal when the loadout cannot be resolved', () => {
    const report = evaluate(loadoutFixture({ offeringId: asGearId('missing-lure') }))

    expect(report.fatal).toBe(true)
    expect(report.score).toBe(0)
  })
})
