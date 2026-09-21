import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { createFightingFish } from '../../src/domain/fishing/createFightingFish'
import { FishingEngine, isTerminalPhase } from '../../src/domain/fishing'
import type { FishingEvent } from '../../src/domain/fishing'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import { asFishIndividualId, asGearId } from '../../src/domain/ids'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'
import { createInitialProgression, resolveFishingModifiers } from '../../src/domain/progression'
import { composeFishingModifiers, resolveTackle } from '../../src/domain/tackle'
import type { Loadout } from '../../src/domain/tackle'
import type { GearItem } from '../../src/domain/gear/Gear'
import { chooseCommand } from '../../scripts/simulate-fishing'

// Phase 9: 大型魚と装備（ライン / リーダー / ドラッグ / フックサイズ）の関係。
// 期待は「Heavy が大型魚で安定する / ただし万能ではない」。

const content = loadContentFromDirectory()
const skill = resolveFishingModifiers({
  skills: createInitialProgression().skills,
  perks: [],
})

const individual = (input: {
  readonly id: string
  readonly speciesId: string
  readonly lengthCm: number
  readonly weightKg: number
}): FishIndividual => ({
  id: asFishIndividualId(input.id),
  speciesId: input.speciesId as FishIndividual['speciesId'],
  lengthCm: input.lengthCm,
  weightKg: input.weightKg,
  condition: 0.5,
  traits: [],
  fightSeed: input.id,
})

const pickGear = (input: {
  readonly category: string
  readonly ratio: number
  readonly value: (item: { readonly [key: string]: unknown }) => number
}): GearItem => {
  const items = content.gear.filter((item) => item.category === input.category)
  const sorted = [...items].sort(
    (left, right) =>
      input.value(left as unknown as { readonly [key: string]: unknown }) -
      input.value(right as unknown as { readonly [key: string]: unknown }),
  )
  const picked = sorted[Math.round((sorted.length - 1) * input.ratio)] ?? sorted[0]

  if (picked === undefined) {
    throw new Error(`no gear for ${input.category}`)
  }

  return picked
}

const heavyLoadout = (): Loadout => ({
  rodId: asGearId(
    String(
      pickGear({
        category: 'rod',
        ratio: 0.95,
        value: (item) => Number(item['power'] === 'XH' ? 1 : 0),
      }).id,
    ),
  ),
  reelId: asGearId(
    String(
      pickGear({ category: 'reel', ratio: 0.95, value: (item) => Number(item['maxDragKg']) }).id,
    ),
  ),
  lineId: asGearId(
    String(
      pickGear({ category: 'line', ratio: 0.95, value: (item) => Number(item['strengthKg']) }).id,
    ),
  ),
  leaderId: asGearId(
    String(
      pickGear({ category: 'leader', ratio: 0.95, value: (item) => Number(item['strengthKg']) }).id,
    ),
  ),
  hookId: asGearId(
    String(
      pickGear({ category: 'hook', ratio: 0.95, value: (item) => Number(item['strengthKg']) }).id,
    ),
  ),
  offeringId: asGearId(
    String(content.gear.find((item) => String(item.id) === 'blue-horizon-deep-jig-128-flash')?.id),
  ),
  methodId: 'lure',
})

const lightLoadout = (): Loadout => ({
  ...heavyLoadout(),
  rodId: asGearId(
    String(
      pickGear({ category: 'rod', ratio: 0.02, value: (item) => Number(item['fightingPower']) }).id,
    ),
  ),
  reelId: asGearId(
    String(
      pickGear({ category: 'reel', ratio: 0.02, value: (item) => Number(item['maxDragKg']) }).id,
    ),
  ),
  lineId: asGearId(
    String(
      pickGear({ category: 'line', ratio: 0.02, value: (item) => Number(item['strengthKg']) }).id,
    ),
  ),
  leaderId: asGearId(
    String(
      pickGear({ category: 'leader', ratio: 0.02, value: (item) => Number(item['strengthKg']) }).id,
    ),
  ),
})

describe('big game balance', () => {
  it('raises the tension limit with leader strength and reel drag', () => {
    const species = content.speciesById['alaska-chinook-salmon']
    expect(species).toBeDefined()

    const base = heavyLoadout()
    const strong = resolveTackle({
      loadout: base,
      gear: content.gear,
      methods: content.methods,
      species: species!,
    })
    const weakLeader = resolveTackle({
      loadout: {
        ...base,
        leaderId: asGearId(
          String(
            pickGear({
              category: 'leader',
              ratio: 0.02,
              value: (item) => Number(item['strengthKg']),
            }).id,
          ),
        ),
      },
      gear: content.gear,
      methods: content.methods,
      species: species!,
    })

    expect(strong?.playerModifiers.maxTensionMultiplier ?? 0).toBeGreaterThan(
      weakLeader?.playerModifiers.maxTensionMultiplier ?? 0,
    )
  })

  it('penalises a hook that does not match the fish size', () => {
    const small = content.speciesById['phase1-sample-fish']
    const loadout = heavyLoadout()
    const bigHook = loadout.hookId
    const smallHook = asGearId(
      String(
        pickGear({ category: 'hook', ratio: 0.02, value: (item) => Number(item['strengthKg']) }).id,
      ),
    )
    const matchedForSmall = resolveTackle({
      loadout: { ...loadout, hookId: smallHook },
      gear: content.gear,
      methods: content.methods,
      species: small!,
    })
    const mismatchedForSmall = resolveTackle({
      loadout: { ...loadout, hookId: bigHook },
      gear: content.gear,
      methods: content.methods,
      species: small!,
    })

    expect(matchedForSmall?.playerModifiers.hookSuccessModifier ?? 0).toBeGreaterThan(
      mismatchedForSmall?.playerModifiers.hookSuccessModifier ?? 0,
    )
    expect(matchedForSmall?.playerModifiers.slackToleranceMultiplier ?? 1).toBeGreaterThan(
      mismatchedForSmall?.playerModifiers.slackToleranceMultiplier ?? 1,
    )
  })

  it('makes larger individuals pull harder and last longer', () => {
    const species = content.speciesById['alaska-chinook-salmon']!
    const random = new SeededRandomSource('big-game-size')
    const traitModifiers = {
      powerMultiplier: 1,
      speedMultiplier: 1,
      staminaMultiplier: 1,
      runChanceMultiplier: 1,
      runDurationMultiplier: 1,
    }
    const median = createFightingFish({
      species,
      individual: individual({
        id: 'median',
        speciesId: 'alaska-chinook-salmon',
        lengthCm: 85,
        weightKg: 8,
      }),
      traitModifiers,
      random,
    })
    const trophy = createFightingFish({
      species,
      individual: individual({
        id: 'trophy',
        speciesId: 'alaska-chinook-salmon',
        lengthCm: 120,
        weightKg: 24,
      }),
      traitModifiers,
      random,
    })

    expect(trophy.pullMultiplier).toBeGreaterThan(median.pullMultiplier)
    expect(trophy.enduranceMultiplier).toBeGreaterThan(median.enduranceMultiplier)
    expect(trophy.pullMultiplier).toBeLessThanOrEqual(3)
  })

  it('lands large fish more reliably with heavy tackle, but not universally', () => {
    const species = content.speciesById['alaska-chinook-salmon']!
    const attempts = 80
    const events: readonly FishingEvent[] = [
      'LANDED',
      'HOOK_MISSED',
      'HOOK_ESCAPE',
      'LINE_BREAK',
      'NO_BITE',
    ]

    const landedCount = (loadout: Loadout): number => {
      const tackle = resolveTackle({
        loadout,
        gear: content.gear,
        methods: content.methods,
        species,
      })

      if (tackle === null) {
        throw new Error('could not resolve tackle')
      }

      const modifiers = composeFishingModifiers(skill, tackle.playerModifiers)
      let landed = 0

      for (let index = 0; index < attempts; index += 1) {
        const engine = new FishingEngine({
          encounters: [{ species, presence: 0.6 }],
          seed: `big-game#${String(index)}`,
          playerModifiers: modifiers,
          encounterProfile: tackle.encounterProfile,
        })
        let guard = 0

        while (guard < 4000) {
          engine.dispatch(chooseCommand('balanced', engine.snapshot()))
          const ticked = engine.tick()
          guard += 1

          if (
            ticked.events.some((event) => events.includes(event)) ||
            isTerminalPhase(ticked.snapshot.phase)
          ) {
            break
          }
        }

        if (engine.snapshot().phase === 'LANDED') {
          landed += 1
        }
      }

      return landed
    }

    const light = landedCount(lightLoadout())
    const heavy = landedCount(heavyLoadout())

    // Heavy は大型魚で明確に安定する（同じ seed なので決定論的）。
    expect(heavy).toBeGreaterThan(light)
    // ただし 100% ではない（軽くても獲れる余地を残す）。
    expect(heavy).toBeLessThan(attempts)
    // 軽量タックルでも 0 ではない（理論上は獲れる）。
    expect(light).toBeGreaterThan(0)
  })
})
