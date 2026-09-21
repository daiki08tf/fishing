import type { FishSpecies } from '../fish/FishSpecies'
import type { RandomSource } from '../rng/RandomSource'
import type { FishingTuning } from '../fishing/FishingTuning'

/**
 * Encounter Engine（Phase 1 版）。ARCHITECTURE.md §7 の最小実装。
 *
 * ARCHITECTURE.md §7 は Date / Time / Weather / Water state / Tide / Knowledge 等を
 * 入力に挙げているが、Phase 1 では「Spot に登録された出現関係（FishOccurrence）」と
 * 乱数だけを使う。季節・時間・潮は Phase 4 以降で追加する。
 *
 * DATA_MODEL.md §8 の EncounterWeight は多数の係数の積になる予定であり、
 * ここでは basePresence のみを扱う。係数を増やしても呼び出し側の形は変わらない。
 */

export type EncounterCandidate = {
  readonly species: FishSpecies
  /** FishOccurrence.basePresence。 */
  readonly presence: number
}

export type EncounterOutcome =
  { readonly kind: 'bite'; readonly candidate: EncounterCandidate } | { readonly kind: 'no_bite' }

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * ヒット確率。
 * 最も強い出現度を持つ魚種で決める（Phase 1 の簡易化）。
 */
export const biteChance = (
  candidates: readonly EncounterCandidate[],
  tuning: FishingTuning,
): number => {
  let maxPresence = 0

  for (const candidate of candidates) {
    maxPresence = Math.max(maxPresence, candidate.presence)
  }

  return clamp01(maxPresence * tuning.biteChancePerPresence)
}

/**
 * ヒットするか、しないかを決め、ヒットする場合は魚種を選ぶ。
 *
 * 乱数の消費:
 * 1. ヒット判定に 1 回
 * 2. 魚種選択に 1 回（ヒットした場合のみ）
 */
export const rollEncounter = (options: {
  readonly candidates: readonly EncounterCandidate[]
  readonly random: RandomSource
  readonly tuning: FishingTuning
}): EncounterOutcome => {
  const { candidates, random, tuning } = options
  const available = candidates.filter((candidate) => candidate.presence > 0)

  if (available.length === 0) {
    return { kind: 'no_bite' }
  }

  if (random.next() >= biteChance(available, tuning)) {
    return { kind: 'no_bite' }
  }

  const totalPresence = available.reduce((total, candidate) => total + candidate.presence, 0)
  let threshold = random.next() * totalPresence

  for (const candidate of available) {
    threshold -= candidate.presence

    if (threshold < 0) {
      return { kind: 'bite', candidate }
    }
  }

  // 浮動小数の誤差で最後まで残った場合は最後の候補を返す。
  const fallback = available[available.length - 1]

  if (fallback === undefined) {
    return { kind: 'no_bite' }
  }

  return { kind: 'bite', candidate: fallback }
}
