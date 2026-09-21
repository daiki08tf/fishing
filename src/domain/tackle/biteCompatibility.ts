import type { FishSpecies } from '../fish/FishSpecies'
import { hookSizeRank, type GearItem } from '../gear/Gear'
import { lengthModelMedian } from '../fish/lengthModel'
import { DEFAULT_GEAR_TUNING, type GearTuning } from '../gear/GearTuning'
import { hookSizeFitFor } from './hookFit'

/**
 * Catchability / Bite Rules（Phase 9.1）。
 *
 * 原則:
 *   Catchability is soft by default.
 *   Physical impossibility is the only normal hard gate.
 *
 * - タックルクラス（Rod / Reel / Line / Leader）は魚種の eligibility を決めない
 * - 釣法・offering の相性は soft（multiplier。0 にしない）
 * - offering / hook が魚に対して物理的に大きすぎる場合だけ hard zero を許す
 * - 小さすぎる offering / hook は可能のまま（確率・保持が悪くなる）
 * - ファイトの難しさは Bite 確率とは別（Fight / Line break 側で表現する）
 *
 * 具体 species ID / lure ID / hook ID では分岐しない（物理値と Content だけを見る）。
 */

export const BITE_FIT_LEVELS = [
  'excellent',
  'good',
  'neutral',
  'poor',
  'very_poor',
  'impossible',
] as const
export type BiteFitLevel = (typeof BITE_FIT_LEVELS)[number]

export const BITE_FIT_LABELS: Readonly<Record<BiteFitLevel, string>> = {
  excellent: '食いつきやすい',
  good: '食いつきは良い',
  neutral: 'ふつう',
  poor: '食いつきにくい',
  very_poor: 'かなり食いつきにくい',
  impossible: '今の仕掛けでは食わない',
}

export type BiteCompatibilityReason =
  'ok' | 'offering_too_large' | 'hook_too_large' | 'offering_size_unknown'

export type BiteCompatibility = {
  /** false のときだけ Bite / Hook を 0 にする（物理的に不可能）。 */
  readonly eligible: boolean
  readonly level: BiteFitLevel
  readonly reason: BiteCompatibilityReason
  /** Encounter の重みに掛ける soft multiplier（eligible=false のときは 0）。 */
  readonly affinityMultiplier: number
  /** 掛かり（アワセ猶予）への加算値。0 が標準。 */
  readonly hookSuccessModifier: number
  /** 保持（糸が緩んでも外れにくい）の倍率。1 が標準。 */
  readonly hookRetentionMultiplier: number
  /** プレイヤー向けの短い説明（UI にそのまま出せる）。 */
  readonly labels: readonly string[]
}

/** 魚種の捕食プロファイル（任意）。未設定は既定（PROVISIONAL）を使う。 */
export type FeedingProfile = {
  readonly preferredOfferingRatio: number
  readonly largeOfferingPenaltyStart: number
  readonly maxOfferingRatio: number
  readonly mouthSizeFactor: number
}

/** 既定の捕食プロファイル（魚種が指定しない場合）。 */
export const DEFAULT_FEEDING_PROFILE: FeedingProfile = {
  preferredOfferingRatio: 0.16,
  largeOfferingPenaltyStart: 0.3,
  maxOfferingRatio: 0.5,
  mouthSizeFactor: 1,
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const feedingProfileOf = (species: FishSpecies): FeedingProfile =>
  species.feedingProfile ?? DEFAULT_FEEDING_PROFILE

/**
 * offering の物理サイズ適合（非対称）。
 *
 * - 大きすぎる → maxOfferingRatio を超えたら impossible（Bite = 0）
 * - 少し大きい → 徐々に下がる（0 にはしない）
 * - 小さすぎる → わずかな penalty のみ（大魚 × 小ルアーは可能）
 * - サイズデータが無い offering（餌など）→ neutral（捏造しない）
 */
const offeringFitFor = (input: {
  readonly species: FishSpecies
  readonly offering: GearItem | null
}): {
  readonly multiplier: number
  readonly ratio: number | null
  readonly impossible: boolean
} => {
  const offering = input.offering

  if (offering === null || offering.category !== 'lure') {
    // 餌は物理長を持たない（データ不足）→ neutral のままにする。
    return { multiplier: 1, ratio: null, impossible: false }
  }

  const profile = feedingProfileOf(input.species)
  const fishMm =
    Math.max(20, lengthModelMedian(input.species.lengthModel) * 10) * profile.mouthSizeFactor
  const ratio = offering.lengthMm / fishMm

  if (ratio > profile.maxOfferingRatio) {
    return { multiplier: 0, ratio, impossible: true }
  }

  if (ratio >= profile.largeOfferingPenaltyStart) {
    const span = Math.max(0.05, profile.maxOfferingRatio - profile.largeOfferingPenaltyStart)
    const severity = clamp((ratio - profile.largeOfferingPenaltyStart) / span, 0, 1)
    // 0.15 まで下がるが 0 にはしない。
    return { multiplier: 1 - severity * 0.85, ratio, impossible: false }
  }

  if (ratio < profile.preferredOfferingRatio) {
    // 小さすぎる offering は penalty を弱くする（非対称）。
    const severity = clamp(1 - ratio / Math.max(0.01, profile.preferredOfferingRatio), 0, 1)
    return { multiplier: 1 - severity * 0.35, ratio, impossible: false }
  }

  return { multiplier: 1, ratio, impossible: false }
}

const levelFor = (input: {
  readonly eligible: boolean
  readonly affinity: number
  readonly reason: BiteCompatibilityReason
}): BiteFitLevel => {
  if (!input.eligible) {
    return 'impossible'
  }

  if (input.affinity >= 1.3) {
    return 'excellent'
  }

  if (input.affinity >= 1.05) {
    return 'good'
  }

  if (input.affinity >= 0.6) {
    return input.reason === 'offering_size_unknown' || input.affinity >= 0.8 ? 'neutral' : 'poor'
  }

  return input.affinity >= 0.3 ? 'poor' : 'very_poor'
}

/**
 * 釣法 × offering タグの相性（soft）。
 * Encounter Engine と同じ規則（speciesAffinity）を、multiplier として評価する。
 */
export const methodOfferingAffinity = (input: {
  readonly species: FishSpecies
  readonly methodId: string
  readonly offeringTags: readonly string[]
}): number => {
  let affinity = input.species.methodAffinity?.[input.methodId] ?? 1

  for (const tag of input.offeringTags) {
    affinity *= input.species.offeringAffinity?.[tag] ?? 1
  }

  return affinity
}

/** offering の相性タグ（Encounter Profile と同じ規則）。 */
export const offeringTagsOfItem = (offering: GearItem | null): readonly string[] => {
  if (offering === null) {
    return []
  }

  if (offering.category === 'lure') {
    return [offering.lureType, ...offering.targetProfile]
  }

  if (offering.category === 'bait') {
    return [offering.baitType, ...offering.targetProfile]
  }

  return []
}

/**
 * その魚種 × その仕掛けの「食いつき / 掛かり」適合を解決する。
 *
 * @param input.offering ルアーまたは餌（餌はサイズ不明として soft 扱い）
 * @param input.hook フック（大きすぎる場合だけ hard zero）
 */
export const resolveBiteCompatibility = (input: {
  readonly species: FishSpecies
  readonly offering: GearItem | null
  readonly hook: GearItem | null
  /** Phase 9.1: presentation penalty（重いロッド × 軽い offering）に使う。 */
  readonly rod?: GearItem | null
  readonly methodId: string
  readonly tuning?: GearTuning
}): BiteCompatibility => {
  const tuning = input.tuning ?? DEFAULT_GEAR_TUNING
  const offeringFit = offeringFitFor({ species: input.species, offering: input.offering })
  const hookFit =
    input.hook !== null && input.hook.category === 'hook'
      ? hookSizeFitFor({
          hookRank: hookSizeRank(input.hook),
          medianCm: lengthModelMedian(input.species.lengthModel),
          tuning,
        })
      : null
  const methodAffinity = methodOfferingAffinity({
    species: input.species,
    methodId: input.methodId,
    offeringTags: offeringTagsOfItem(input.offering),
  })
  const softAffinity = clamp(methodAffinity, tuning.methodAffinityMin, tuning.methodAffinityMax)
  /*
   * 重いロッドに軽すぎる offering を付けると扱いが悪い（presentation）。
   * 物理的に不可能ではないので soft に留める（B4 の「Heavy は万能ではない」）。
   */
  const rod = input.rod ?? null
  const underRated =
    rod !== null &&
    rod.category === 'rod' &&
    input.offering !== null &&
    input.offering.category === 'lure'
      ? clamp(
          (tuning.underRatedOfferingThreshold -
            input.offering.weightG / Math.max(1, rod.maxLureWeightG)) /
            tuning.underRatedOfferingThreshold,
          0,
          1,
        )
      : 0
  const offeringMultiplier =
    offeringFit.multiplier * (1 - underRated * tuning.underRatedOfferingPenalty)
  const eligible = !offeringFit.impossible && hookFit?.impossible !== true
  const reason: BiteCompatibilityReason = !eligible
    ? offeringFit.impossible
      ? 'offering_too_large'
      : 'hook_too_large'
    : offeringFit.ratio === null
      ? 'offering_size_unknown'
      : 'ok'
  const affinity = eligible ? softAffinity * offeringMultiplier : 0
  const labels: string[] = [BITE_FIT_LABELS[levelFor({ eligible, affinity, reason })]]

  if (offeringFit.impossible) {
    labels.push('ルアーが大きすぎる（口に入らない）')
  } else if (hookFit?.impossible === true) {
    labels.push('針が大きすぎる（口に入らない）')
  } else {
    if (offeringMultiplier < 0.9) {
      labels.push(
        offeringFit.ratio !== null && offeringFit.ratio > 1 ? 'ルアーが大きい' : 'ルアーが小さい',
      )
    }

    if (underRated > 0.5) {
      labels.push('ロッドに対してルアーが軽すぎる（扱いにくい）')
    }

    if (hookFit !== null && hookFit.gap > 2) {
      labels.push('針が大きい（掛かりにくい）')
    }

    if (hookFit !== null && hookFit.gap < -2) {
      labels.push('針が小さい（外れやすい）')
    }
  }

  return {
    eligible,
    level: levelFor({ eligible, affinity, reason }),
    reason,
    affinityMultiplier: Math.round(affinity * 1000) / 1000,
    hookSuccessModifier: hookFit?.success ?? 0,
    hookRetentionMultiplier: hookFit?.holding ?? 1,
    labels,
  }
}
