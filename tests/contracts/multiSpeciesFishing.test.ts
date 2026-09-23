import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import {
  emptyCodexState,
  recordCatch,
  recordedSpeciesCount,
  toRecordEntry,
} from '../../src/domain/codex'
import { FishingEngine } from '../../src/domain/fishing'
import { NEUTRAL_FISHING_MODIFIERS } from '../../src/domain/fishing/PlayerFishingModifiers'
import { asFishSpeciesId } from '../../src/domain/ids'
import { createTestSpecies } from '../fixtures/species'
import { runFightToTerminal } from '../fixtures/fishingPolicies'

/**
 * 「Species を追加しても Engine を書き換えなくてよい」ことの証明。
 *
 * このテストは Content の魚種をループで回すだけで、
 * 魚種ごとの分岐を一切持たない。魚種名・サイズ・ファイト特性は
 * すべて Content から供給される。
 */

const content = loadContentFromDirectory()

/**
 * 重量級タックル相当の倍率（Phase 10 の Text Battle は装備で結果が変わる）。
 *
 * 装備なし（neutral）だと大型魚はほぼ獲れないが、重いタックルなら
 * 「難しいが獲れる」になる。ここで見たいのは魚種ごとの分岐が無いことなので、
 * 現実的なタックル相当の倍率で「どの魚種も獲れる」ことを確認する。
 *
 * Phase 18A: 大型魚のスケーリング上限が外れたため、100kg 級の魚は
 * 軽いタックルでは通常獲れない（それが Phase 18 の狙い）。
 * この契約が守りたいのは「十分なタックルなら全魚種を獲れる」ことであり、
 * 倍率は endgame の heavy setup 相当（実 Content で実現可能な範囲）にする。
 */
const HEAVY_TACKLE_MODIFIERS = {
  ...NEUTRAL_FISHING_MODIFIERS,
  maxTensionMultiplier: 2.8,
  reelEfficiencyMultiplier: 1.8,
  giveEfficiencyMultiplier: 1.6,
  landingStabilityMultiplier: 1.4,
}

describe('multi species fishing', () => {
  it('loads the sample species and builds encounters from the spot', () => {
    expect(content.species.length).toBeGreaterThanOrEqual(10)
    expect(content.encounters.length).toBe(content.primarySpot.fishTable.length)
    // Spot ごとに魚種が違ってよい（Phase 4 で複数 Spot を扱う）。
    expect(content.primarySpot.fishTable.length).toBeGreaterThan(0)
    expect(content.spots.length).toBeGreaterThan(1)
  })

  it('lands every species in the content', () => {
    for (const species of content.species) {
      /*
       * Phase 9 で個体サイズが引きの強さに効くようになったため、
       * 1 つの seed では大型個体が逃げることがある。
       * 「その魚種を獲れる」ことは、複数 seed のうち 1 回以上で確認する。
       */
      const seeds = Array.from({ length: 8 }, (_, index) =>
        index === 0 ? 'multispecies' : `multispecies#${String(index + 1)}`,
      )
      const outcomes = seeds.map((seed) => {
        const engine = new FishingEngine({
          encounters: [{ species, presence: 1 }],
          seed,
          playerModifiers: HEAVY_TACKLE_MODIFIERS,
        })

        return { outcome: runFightToTerminal(engine), engine }
      })
      const landed = outcomes.find((entry) => entry.outcome.phase === 'LANDED')

      expect(landed, `${String(species.id)} was not landed`).toBeDefined()

      const individual = landed?.engine.snapshot().fish?.individual

      expect(individual).toBeDefined()
      expect(individual?.speciesId).toBe(species.id)
      expect(individual?.weightKg).toBeGreaterThan(0)
      expect(individual?.percentile).toBeGreaterThanOrEqual(0)
    }
  })

  it('produces different fight lengths for different species', () => {
    const lengths = new Set<number>()

    for (const species of content.species) {
      const engine = new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: 'variety',
      })

      // Phase 10: ファイトの長さは battle step（コマンド数）で見る。
      lengths.add(runFightToTerminal(engine).steps)
    }

    // サイズもスタミナも違うので、同じ長さにはならない。
    expect(lengths.size).toBeGreaterThan(3)
  })

  it('fights a species that was never part of the content', () => {
    // Content に存在しない魚種でも、Species の形を満たしていれば Engine は動く。
    const invented = createTestSpecies({
      id: asFishSpeciesId('invented-species'),
      japaneseName: 'その場で作った魚',
      lengthModel: {
        kind: 'lognormal',
        medianCm: 55,
        dispersion: 0.16,
        minCm: 20,
        maxCm: 95,
      },
      weightModel: { lengthWeightA: 0.0065, lengthWeightB: 3.1 },
      fightProfile: { strength: 0.8, stamina: 0.75, speed: 0.3 },
    })

    const engine = new FishingEngine({
      encounters: [{ species: invented, presence: 1 }],
      seed: 'invented',
    })

    const outcome = runFightToTerminal(engine)

    expect(outcome.phase).toBe('LANDED')
    expect(engine.snapshot().fish?.individual.speciesId).toBe('invented-species')
    expect(engine.snapshot().fish?.speciesName).toBe('その場で作った魚')
  })

  it('records every landed fish into the codex', () => {
    let codex = emptyCodexState()

    for (const species of content.species) {
      const engine = new FishingEngine({
        encounters: [{ species, presence: 1 }],
        seed: 'codex',
      })

      runFightToTerminal(engine)

      const individual = engine.snapshot().fish?.individual
      expect(individual).toBeDefined()

      if (individual !== undefined) {
        codex = recordCatch(codex, toRecordEntry(individual, '2026-01-01T00:00:00.000Z')).state
      }
    }

    expect(recordedSpeciesCount(codex)).toBe(content.species.length)

    for (const species of content.species) {
      const record = codex.species[String(species.id)]

      expect(record).toBeDefined()
      expect(record?.catchCount).toBe(1)
      expect(record?.largestLengthCm).toBeGreaterThan(0)
    }
  })
})
