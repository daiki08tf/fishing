import { describe, expect, it } from 'vitest'
import { FishingEngine } from '../fishing/FishingEngine'
import { NEUTRAL_FISHING_MODIFIERS } from '../fishing/PlayerFishingModifiers'
import { asGearId } from '../ids'
import {
  GEAR_FIXTURE_IDS,
  gearFixture,
  loadoutFixture,
  methodFixture,
} from '../../../tests/fixtures/gear'
import { createTestSpecies } from '../../../tests/fixtures/species'
import type { Loadout } from './Loadout'
import { composeFishingModifiers, resolveTackle } from './resolveTackle'

const gear = gearFixture()
const methods = methodFixture()

const resolve = (loadout: Loadout) => resolveTackle({ loadout, gear, methods })

const mustResolve = (loadout: Loadout) => {
  const setup = resolve(loadout)

  if (setup === null) {
    throw new Error('expected the loadout to resolve')
  }

  return setup
}

describe('resolveTackle: line', () => {
  it('raises the tension the tackle can take with a stronger line', () => {
    const light = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
      }),
    )
    const heavy = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineHeavy),
      }),
    )

    expect(heavy.playerModifiers.maxTensionMultiplier).toBeGreaterThan(
      light.playerModifiers.maxTensionMultiplier,
    )
  })

  it('changes the tension the engine can take (line break threshold)', () => {
    const species = createTestSpecies()
    const encounters = [{ species, presence: 1 }]
    const light = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
      }),
    )
    const heavy = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineHeavy),
      }),
    )

    const lightEngine = new FishingEngine({
      encounters,
      seed: 'line',
      playerModifiers: light.playerModifiers,
    })
    const heavyEngine = new FishingEngine({
      encounters,
      seed: 'line',
      playerModifiers: heavy.playerModifiers,
    })

    expect(heavyEngine.effectiveMaxTension()).toBeGreaterThan(lightEngine.effectiveMaxTension())
  })
})

describe('resolveTackle: reel', () => {
  it('raises the reel efficiency with a stronger drag', () => {
    const light = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
      }),
    )
    const power = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        reelId: asGearId(GEAR_FIXTURE_IDS.reelPower),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineHeavy),
      }),
    )

    expect(power.playerModifiers.reelEfficiencyMultiplier).toBeGreaterThan(
      light.playerModifiers.reelEfficiencyMultiplier,
    )
  })
})

describe('resolveTackle: rod', () => {
  it('lowers the tension gain with a more controlling rod', () => {
    // ラインを揃えて、ロッドの control だけを変える。
    const finesse = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodFinesse),
        offeringId: asGearId(GEAR_FIXTURE_IDS.lureLight),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
        reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
      }),
    )
    const power = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        offeringId: asGearId(GEAR_FIXTURE_IDS.lureLight),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
        reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
      }),
    )

    // ロッドの control が高いほどテンションが上がりにくい（倍率は小さい）。
    expect(finesse.playerModifiers.tensionGainMultiplier).toBeLessThan(
      power.playerModifiers.tensionGainMultiplier,
    )
  })

  it('rates a finesse rod as more sensitive and less powerful', () => {
    const finesse = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodFinesse),
        offeringId: asGearId(GEAR_FIXTURE_IDS.lureLight),
        lineId: asGearId(GEAR_FIXTURE_IDS.lineLight),
        reelId: asGearId(GEAR_FIXTURE_IDS.reelLight),
      }),
    )
    const power = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        offeringId: asGearId(GEAR_FIXTURE_IDS.lureHeavy),
      }),
    )

    expect(finesse.ratings.finesse).toBeGreaterThan(power.ratings.finesse)
    expect(power.ratings.power).toBeGreaterThan(finesse.ratings.power)
  })
})

describe('resolveTackle: hook', () => {
  it('changes hooking and escape through the hook', () => {
    const small = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        hookId: asGearId(GEAR_FIXTURE_IDS.hookSmall),
      }),
    )
    const large = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        hookId: asGearId(GEAR_FIXTURE_IDS.hookLarge),
      }),
    )

    // 掛かりやすい針は hook success、外れにくい針は slack tolerance が高い。
    expect(small.playerModifiers.hookSuccessModifier).toBeGreaterThan(
      large.playerModifiers.hookSuccessModifier,
    )
    expect(large.playerModifiers.slackToleranceMultiplier).toBeGreaterThan(
      small.playerModifiers.slackToleranceMultiplier,
    )
  })

  it('changes the slack ticks before escape in the engine', () => {
    const species = createTestSpecies()
    const small = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        hookId: asGearId(GEAR_FIXTURE_IDS.hookSmall),
      }),
    )
    const large = mustResolve(
      loadoutFixture({
        rodId: asGearId(GEAR_FIXTURE_IDS.rodPower),
        hookId: asGearId(GEAR_FIXTURE_IDS.hookLarge),
      }),
    )
    const engine = (modifiers: typeof small.playerModifiers) =>
      new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: 'hook',
        playerModifiers: modifiers,
      })

    expect(engine(large.playerModifiers).effectiveSlackTicksBeforeEscape()).toBeGreaterThan(
      engine(small.playerModifiers).effectiveSlackTicksBeforeEscape(),
    )
  })
})

describe('resolveTackle: encounter profile', () => {
  it('carries the method and the offering tags', () => {
    const setup = mustResolve(loadoutFixture())

    expect(setup.encounterProfile.methodId).toBe('lure')
    expect(setup.encounterProfile.offeringId).toBe(GEAR_FIXTURE_IDS.lureHeavy)
    expect(setup.encounterProfile.offeringKind).toBe('lure')
    // targetProfile のタグが Encounter の相性判定に渡る。
    expect(setup.encounterProfile.offeringTags).toContain('jig')
    expect(setup.encounterProfile.offeringTags).toContain('large')
  })

  it('is null when the method does not exist', () => {
    expect(resolve(loadoutFixture({ methodId: 'no-such-method' }))).toBeNull()
  })

  it('is null when the gear is missing', () => {
    expect(resolve(loadoutFixture({ offeringId: asGearId('no-such-gear') }))).toBeNull()
  })
})

describe('resolveTackle: determinism', () => {
  it('returns the same numbers for the same loadout', () => {
    expect(resolve(loadoutFixture())).toEqual(resolve(loadoutFixture()))
  })
})

describe('composeFishingModifiers', () => {
  it('multiplies multipliers and adds the hook success modifier', () => {
    const combined = composeFishingModifiers(
      { ...NEUTRAL_FISHING_MODIFIERS, reelEfficiencyMultiplier: 1.2, hookSuccessModifier: 0.1 },
      { ...NEUTRAL_FISHING_MODIFIERS, reelEfficiencyMultiplier: 1.5, hookSuccessModifier: 0.2 },
    )

    expect(combined.reelEfficiencyMultiplier).toBeCloseTo(1.8, 6)
    expect(combined.hookSuccessModifier).toBeCloseTo(0.3, 6)
    expect(combined.tensionGainMultiplier).toBe(1)
  })

  it('keeps the skill modifiers when the tackle is neutral', () => {
    const skill = { ...NEUTRAL_FISHING_MODIFIERS, tensionGainMultiplier: 0.8 }

    expect(composeFishingModifiers(skill, NEUTRAL_FISHING_MODIFIERS)).toEqual(skill)
  })
})

describe('FishingEngine with resolved tackle', () => {
  it('changes the encounter outcome with the profile for the same seed', () => {
    const species = createTestSpecies()
    const encounters = [{ species, presence: 0.5 }]

    // 同じ seed でも、相性が良い構成のほうがヒットしやすい。
    let neutralBites = 0
    let profileBites = 0

    for (let seed = 0; seed < 400; seed += 1) {
      const a = new FishingEngine({ encounters, seed })
      const b = new FishingEngine({
        encounters,
        seed,
        encounterProfile: { methodId: 'lure', offeringTags: ['big'], biteAffinity: 1.4 },
      })

      a.cast()
      b.cast()

      for (let tick = 0; tick < 60; tick += 1) {
        a.tick()
        b.tick()
      }

      if (a.snapshot().fish !== null) {
        neutralBites += 1
      }

      if (b.snapshot().fish !== null) {
        profileBites += 1
      }
    }

    expect(profileBites).toBeGreaterThan(neutralBites)
  })
})
