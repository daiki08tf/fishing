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
  /**
   * Phase 9.1: 物理的に食いつけない組み合わせ（ルアー / フックが大きすぎる）は false。
   * Spot から魚を消すのではなく「その魚はいるが、今の仕掛けには食わない」を表す。
   */
  readonly biteEligible?: boolean
  /**
   * Phase 9.1: 釣法 × offering × サイズ適合の soft multiplier。
   * 指定すると speciesAffinity の代わりに使う（0.15〜1.8。0 にはしない）。
   */
  readonly affinityMultiplier?: number
  /** Phase 9.1: この魚に対するフックの掛かり（加算値）。0 が標準。 */
  readonly hookSuccessModifier?: number
  /** Phase 9.1: この魚に対するフックの保持（倍率）。1 が標準。 */
  readonly hookRetentionMultiplier?: number
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

/**
 * Phase 9.1: 相性の soft な範囲。
 * excellent / good / neutral / poor / very poor を表すが、0 にはしない
 * （0 にしてよいのは物理的に不可能な場合だけ。
 * それは biteEligible = false で表現する）。
 */
const SOFT_AFFINITY_MIN = 0.15
const SOFT_AFFINITY_MAX = 1.8

const clampAffinity = (value: number): number =>
  Math.min(SOFT_AFFINITY_MAX, Math.max(SOFT_AFFINITY_MIN, value))

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

/** その候補の soft affinity（候補が解決済みならそれを優先する）。 */
export const candidateAffinity = (
  candidate: EncounterCandidate,
  profile: EncounterProfile | undefined,
): number =>
  clampAffinity(candidate.affinityMultiplier ?? speciesAffinity(candidate.species, profile))

/** 物理的に不可能な組み合わせ（Bite / Hook = 0）かどうか。 */
export const isCandidateEligible = (candidate: EncounterCandidate): boolean =>
  candidate.biteEligible !== false

/** Encounter の重み。basePresence × 相性。 */
export const encounterWeight = (
  candidate: EncounterCandidate,
  profile: EncounterProfile | undefined,
): number =>
  isCandidateEligible(candidate)
    ? Math.max(0, candidate.presence * candidateAffinity(candidate, profile))
    : 0

/**
 * ヒット確率。
 *
 * Phase 9.1: 最も強い「実効出現度」（出現度 × 相性 × サイズ適合）で決める。
 * 物理的に不可な候補は数えない（0 になる）。相性は soft（0.15〜1.8）で 0 にしない。
 */
export const biteChance = (
  candidates: readonly EncounterCandidate[],
  tuning: FishingTuning,
  profile?: EncounterProfile,
): number => {
  let maxEffectivePresence = 0

  for (const candidate of candidates) {
    if (!isCandidateEligible(candidate)) {
      continue
    }

    maxEffectivePresence = Math.max(
      maxEffectivePresence,
      candidate.presence * candidateAffinity(candidate, profile),
    )
  }

  // 仕掛け全体の相性（method × stealth × compatibility）。soft な範囲に収める。
  const affinity = profile === undefined ? 1 : clampAffinity(profile.biteAffinity)

  /*
   * Phase 10.2 playtest tuning:
   * 線形の確率だと、出現度や好条件が少し高いだけで Bite が 100% に張り付きやすく、
   * 「投げればすぐ食う」感が強かった。
   *
   * effectivePresence をそのまま確率にせず「bite pressure」として扱い、
   * 1 - exp(-pressure) の飽和カーブへ変換する。
   * - 普通の魚はボウズ / 空振りが自然に混ざる
   * - 良条件や高 presence は明確に有利
   * - ただし有限の pressure では Bite が自動的に 100% にならない
   *
   * Catchability の soft/hard gate 原則は変えない。
   */
  const bitePressure = Math.max(
    0,
    maxEffectivePresence * tuning.biteChancePerPresence * affinity,
  )

  return clamp01(1 - Math.exp(-bitePressure))
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
  const available = candidates.filter(
    (candidate) => candidate.presence > 0 && isCandidateEligible(candidate),
  )

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
