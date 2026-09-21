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

/**
 * 釣法と offering（ルアー/餌）から作る重み付けの入力。
 *
 * Phase 6 で導入。天候・潮・季節・時間帯はまだ接続しない。
 * 「特定のルアーでないと釣れない」ためではなく、相性の良し悪しに使う。
 */
export type EncounterProfile = {
  readonly methodId: string
  readonly offeringTags: readonly string[]
  /** 構成全体のヒットの出やすさ（倍率）。 */
  readonly biteAffinity: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** 魚種ごとの相性（釣法 × offering タグ）。1 が標準。 */
export const speciesAffinity = (
  species: FishSpecies,
  profile: EncounterProfile | undefined,
): number => {
  if (profile === undefined) {
    return 1
  }

  const method = species.methodAffinity?.[profile.methodId] ?? 1
  let offering = 1

  for (const tag of profile.offeringTags) {
    offering *= species.offeringAffinity?.[tag] ?? 1
  }

  return method * offering
}

/** Encounter の重み。basePresence × 相性。 */
export const encounterWeight = (
  candidate: EncounterCandidate,
  profile: EncounterProfile | undefined,
): number => Math.max(0, candidate.presence * speciesAffinity(candidate.species, profile))

/**
 * ヒット確率。
 * 最も強い出現度を持つ魚種で決める（Phase 1 の簡易化）。
 */
export const biteChance = (
  candidates: readonly EncounterCandidate[],
  tuning: FishingTuning,
  profile?: EncounterProfile,
): number => {
  let maxPresence = 0

  for (const candidate of candidates) {
    maxPresence = Math.max(maxPresence, candidate.presence)
  }

  // 相性が良い構成ほどヒットが出やすい（ただし 0.7〜1.4 倍に収める）。
  const affinity = profile === undefined ? 1 : Math.min(1.4, Math.max(0.7, profile.biteAffinity))

  return clamp01(maxPresence * tuning.biteChancePerPresence * affinity)
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
  readonly profile?: EncounterProfile
}): EncounterOutcome => {
  const { candidates, random, tuning } = options
  const available = candidates.filter((candidate) => candidate.presence > 0)

  if (available.length === 0) {
    return { kind: 'no_bite' }
  }

  if (random.next() >= biteChance(available, tuning, options.profile)) {
    return { kind: 'no_bite' }
  }

  // 釣法と offering の相性で魚種の重みを変える。
  const totalWeight = available.reduce(
    (total, candidate) => total + encounterWeight(candidate, options.profile),
    0,
  )
  let threshold = random.next() * totalWeight

  for (const candidate of available) {
    threshold -= encounterWeight(candidate, options.profile)

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
