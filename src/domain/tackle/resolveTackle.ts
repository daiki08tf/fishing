import type { FishSpecies } from '../fish/FishSpecies'
import { hookSizeRank, offeringTagsOf, type GearItem, type GearCategory } from '../gear/Gear'
import { lengthModelMedian } from '../fish/lengthModel'
import { DEFAULT_GEAR_TUNING, type GearTuning } from '../gear/GearTuning'
import {
  NEUTRAL_FISHING_MODIFIERS,
  type PlayerFishingModifiers,
} from '../fishing/PlayerFishingModifiers'
import type { FishingMethod } from '../method/FishingMethod'
import {
  evaluateCompatibility,
  resolveGearForLoadout,
  type CompatibilityReport,
} from './compatibility'
import type { Loadout } from './Loadout'

/**
 * Tackle Resolver。
 *
 *   Loadout → ResolvedFishingSetup → Encounter / Fishing
 *
 * FishingEngine は装備名もカテゴリも知らない。ここで解決した
 * `PlayerFishingModifiers` と Encounter 用の profile だけを受け取る。
 * 装備を増やしても Engine は変わらない。
 */

export type EncounterProfile = {
  readonly methodId: string
  readonly offeringId: string
  readonly offeringKind: 'lure' | 'bait'
  /** 魚種の offeringAffinity と突き合わせるタグ。 */
  readonly offeringTags: readonly string[]
  /** 構成全体のヒットの出やすさ（倍率）。 */
  readonly biteAffinity: number
}

export type TackleRatings = {
  readonly power: number
  readonly finesse: number
  readonly distance: number
  readonly control: number
}

export type ResolvedFishingSetup = {
  readonly loadout: Loadout
  readonly gearIds: Readonly<Record<string, string>>
  readonly categories: readonly GearCategory[]
  readonly method: FishingMethod
  /** FishingEngine へ渡す（技量と合成する前の）装備由来の倍率。 */
  readonly playerModifiers: PlayerFishingModifiers
  readonly encounterProfile: EncounterProfile
  readonly ratings: TackleRatings
  readonly compatibility: CompatibilityReport
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * Phase 9: 魚の大きさに対して期待されるフックサイズ（rank）。
 * hookSizeRank は「大きい針ほど大きい値」。値は PROVISIONAL。
 */
const EXPECTED_HOOK_RANK: readonly { readonly cm: number; readonly rank: number }[] = [
  { cm: 15, rank: -9 },
  { cm: 25, rank: -6 },
  { cm: 40, rank: -1 },
  { cm: 60, rank: 3 },
  { cm: 90, rank: 6 },
  { cm: 120, rank: 9 },
]

const expectedHookRank = (medianCm: number): number => {
  const first = EXPECTED_HOOK_RANK[0] as { readonly cm: number; readonly rank: number }
  const last = EXPECTED_HOOK_RANK[EXPECTED_HOOK_RANK.length - 1] as {
    readonly cm: number
    readonly rank: number
  }

  if (medianCm <= first.cm) {
    return first.rank
  }

  if (medianCm >= last.cm) {
    return last.rank
  }

  for (let index = 0; index < EXPECTED_HOOK_RANK.length - 1; index += 1) {
    const left = EXPECTED_HOOK_RANK[index] as { readonly cm: number; readonly rank: number }
    const right = EXPECTED_HOOK_RANK[index + 1] as { readonly cm: number; readonly rank: number }

    if (medianCm >= left.cm && medianCm <= right.cm) {
      const ratio = (medianCm - left.cm) / (right.cm - left.cm)
      return left.rank + (right.rank - left.rank) * ratio
    }
  }

  return last.rank
}

/**
 * フックサイズのミスマッチ（±2 rank までは許容）。
 * 大型魚に小さい針 / 小型魚に大きい針は、掛かりとアワセ猶予を落とす。
 */
const hookSizeAdjustmentFor = (input: {
  readonly hookRank: number
  readonly medianCm: number
  readonly tuning: GearTuning
}): {
  readonly success: number
  readonly hookWindow: number
  readonly holding: number
} => {
  const gap = Math.abs(input.hookRank - expectedHookRank(input.medianCm))
  const severity = clamp((gap - 2) / 12, 0, 1)

  return {
    success: -input.tuning.hookSizeMismatchStrength * severity,
    hookWindow: clamp(1 - input.tuning.hookSizeMismatchWindowStrength * severity, 0.7, 1),
    holding: clamp(1 - input.tuning.hookSizeMismatchHoldingStrength * severity, 0.55, 1),
  }
}

export const resolveTackle = (options: {
  readonly loadout: Loadout
  readonly gear: readonly GearItem[]
  readonly methods: readonly FishingMethod[]
  readonly species?: FishSpecies
  readonly tuning?: GearTuning
}): ResolvedFishingSetup | null => {
  const tuning = options.tuning ?? DEFAULT_GEAR_TUNING
  const resolved = resolveGearForLoadout(options.loadout, options.gear)
  const method = options.methods.find((entry) => entry.id === options.loadout.methodId)

  if (resolved === null || method === undefined) {
    return null
  }

  const { rod, reel, line, leader, hook, offering } = resolved
  const compatibility = evaluateCompatibility({
    loadout: options.loadout,
    gear: options.gear,
    method,
    ...(options.species === undefined ? {} : { species: options.species }),
  })
  const methodTuning = tuning.methods[method.id] ?? {
    castDistance: 0.5,
    control: 0.5,
    biteAffinity: 1,
  }

  // ライン強度（kg）を 0〜1 のスケールへ。
  const strengthScale = clamp01(
    (line.strengthKg - tuning.lineStrengthRangeKg.min) /
      (tuning.lineStrengthRangeKg.max - tuning.lineStrengthRangeKg.min),
  )
  const lineTensionBonus =
    tuning.lineStrengthMultiplierRange.min +
    (tuning.lineStrengthMultiplierRange.max - tuning.lineStrengthMultiplierRange.min) *
      strengthScale
  const leaderBonus = leader === null ? 0 : 0.08 * leader.abrasionResistance
  // Phase 9: リーダー強度も break threshold に効く（弱いリーダーは下がる）。
  const leaderStrengthRange = tuning.leaderStrengthRangeKg
  const leaderStrengthScale =
    leader === null
      ? 0
      : clamp01(
          (leader.strengthKg - leaderStrengthRange.min) /
            Math.max(1, leaderStrengthRange.max - leaderStrengthRange.min),
        )
  const leaderStrengthBonus =
    leader === null
      ? 0
      : tuning.leaderStrengthMultiplierRange.min +
        (tuning.leaderStrengthMultiplierRange.max - tuning.leaderStrengthMultiplierRange.min) *
          leaderStrengthScale
  // Phase 9: リールのドラッグ力（実スペック）も耐えられるテンションに効く。
  const dragRange = tuning.reelDragTensionRangeKg
  const dragBonus =
    tuning.reelDragTensionStrength *
    clamp01((reel.maxDragKg - dragRange.min) / Math.max(1, dragRange.max - dragRange.min))

  /*
   * 自重は「扱いやすさ」に効く（軽いほど有利）。
   * 重い＝悪ではない（剛性・トルクと引き換え）ので、係数は小さく留める。
   */
  const rodWeightRelief = tuning.weightControlStrength * clamp01((220 - rod.weightG) / 220)
  const reelWeightRelief = tuning.weightControlStrength * clamp01((420 - reel.weightG) / 420)
  const dragStartup = reel.dragStartup ?? 0.5
  const rigidity = reel.rigidity ?? 0.5
  const windingTorque = reel.windingTorque ?? 0.5
  const response = reel.response ?? 0.5
  const medianCm =
    options.species === undefined ? null : lengthModelMedian(options.species.lengthModel)
  const hookSizeAdjustment =
    medianCm === null
      ? { success: 0, hookWindow: 1, holding: 1 }
      : hookSizeAdjustmentFor({ hookRank: hookSizeRank(hook), medianCm, tuning })

  const playerModifiers: PlayerFishingModifiers = {
    ...NEUTRAL_FISHING_MODIFIERS,
    // ロッドの主導権・ラインの伸び・ドラッグ初動・軽さがテンション上昇を抑える。
    tensionGainMultiplier: clamp(
      (1 - tuning.rodControlStrength * rod.control) *
        (1 - tuning.lineStretchRelief * line.stretch) *
        (1 - tuning.reelDragStartupStrength * dragStartup) *
        (1 - rodWeightRelief - reelWeightRelief),
      0.4,
      1,
    ),
    // ロッドの寄せる力・ラインの強さ・リールの剛性が「耐えられるテンション」を上げる。
    maxTensionMultiplier: clamp(
      lineTensionBonus +
        tuning.rodFightingStrength * rod.fightingPower +
        tuning.reelRigidityStrength * rigidity +
        leaderBonus +
        leaderStrengthBonus +
        dragBonus,
      0.7,
      2.8,
    ),
    // リールのドラッグ・滑らかさ・トルク・レスポンス。
    reelEfficiencyMultiplier: clamp(
      1 +
        tuning.reelDragStrength * (reel.maxDragKg / 10) +
        tuning.reelSmoothnessStrength * reel.smoothness +
        tuning.reelTorqueStrength * windingTorque +
        tuning.reelResponseStrength * response,
      0.7,
      1.8,
    ),
    // GIVE はドラッグの出だしと滑らかさで決まる（初動が滑らかだと糸が緩みすぎない）。
    giveEfficiencyMultiplier: clamp(
      1 +
        tuning.reelSmoothnessStrength * reel.smoothness +
        tuning.reelDragStartupStrength * dragStartup +
        tuning.reelResponseStrength * response,
      0.8,
      1.6,
    ),
    // 感度（ロッド + ライン）がアタリの見え方に効く。
    detectionClarityMultiplier: clamp(
      1 + tuning.sensitivityStrength * rod.sensitivity + 0.3 * line.sensitivity,
      0.8,
      1.7,
    ),
    castingPrecisionMultiplier: clamp(
      1 + tuning.castingStrength * rod.castingProfile + 0.2 * methodTuning.castDistance,
      0.8,
      1.7,
    ),
    // フックの掛かり・保持。
    hookSuccessModifier:
      tuning.hookPenetrationStrength * hook.penetration + hookSizeAdjustment.success,
    hookWindowMultiplier: hookSizeAdjustment.hookWindow,
    slackToleranceMultiplier: clamp(
      (1 + tuning.hookHoldingStrength * hook.holdingPower) * hookSizeAdjustment.holding,
      0.6,
      1.6,
    ),
    landingStabilityMultiplier: clamp(1 + 0.3 * rod.fightingPower, 0.8, 1.4),
    riggingEfficiencyMultiplier: 1,
  }

  // ヒットの出やすさ: ライン/リーダーの見えにくさ × 釣法 × 相性。
  /*
   * Phase 9: ラインの視認されにくさをヒットの出やすさへ、より素直に反映する。
   * 太い（目立つ）ラインは小さい魚ほど不利になる。
   */
  const stealth =
    0.8 +
    0.4 * line.visibility -
    tuning.lineDiameterBitePenalty * Math.min(0.5, line.diameterMm) +
    (leader === null ? 0 : 0.1 * leader.visibility)
  const biteAffinity = clamp(
    methodTuning.biteAffinity * stealth * (0.9 + 0.2 * compatibility.score),
    0.7,
    1.4,
  )

  const lureWeight = offering.category === 'lure' ? offering.weightG : 15
  const ratings: TackleRatings = {
    power: clamp01(0.5 * rod.fightingPower + 0.3 * (reel.maxDragKg / 10) + 0.2 * strengthScale),
    finesse: clamp01(
      0.4 * rod.sensitivity +
        0.3 * (1 - Math.min(1, line.diameterMm / 0.4)) +
        0.3 * (1 - Math.min(1, lureWeight / 40)),
    ),
    distance: clamp01(
      0.5 * rod.castingProfile +
        0.3 * methodTuning.castDistance +
        0.2 * (1 - Math.min(1, line.diameterMm / 0.4)),
    ),
    control: clamp01(0.5 * rod.control + 0.3 * methodTuning.control + 0.2 * reel.control),
  }

  return {
    loadout: options.loadout,
    gearIds: {
      rod: String(rod.id),
      reel: String(reel.id),
      line: String(line.id),
      leader: leader === null ? '' : String(leader.id),
      hook: String(hook.id),
      offering: String(offering.id),
    },
    categories: [rod.category, reel.category, line.category, hook.category, offering.category],
    method,
    playerModifiers,
    encounterProfile: {
      methodId: method.id,
      offeringId: String(offering.id),
      offeringKind: offering.category,
      offeringTags: offeringTagsOf(offering),
      biteAffinity,
    },
    ratings,
    compatibility,
  }
}

/** 技量と装備の倍率を合成する（同じものを二重実装しない）。 */
export const composeFishingModifiers = (
  skillModifiers: PlayerFishingModifiers,
  tackleModifiers: PlayerFishingModifiers,
): PlayerFishingModifiers => ({
  reelEfficiencyMultiplier:
    skillModifiers.reelEfficiencyMultiplier * tackleModifiers.reelEfficiencyMultiplier,
  tensionGainMultiplier:
    skillModifiers.tensionGainMultiplier * tackleModifiers.tensionGainMultiplier,
  giveEfficiencyMultiplier:
    skillModifiers.giveEfficiencyMultiplier * tackleModifiers.giveEfficiencyMultiplier,
  hookWindowMultiplier: skillModifiers.hookWindowMultiplier * tackleModifiers.hookWindowMultiplier,
  hookSuccessModifier: skillModifiers.hookSuccessModifier + tackleModifiers.hookSuccessModifier,
  castingPrecisionMultiplier:
    skillModifiers.castingPrecisionMultiplier * tackleModifiers.castingPrecisionMultiplier,
  landingStabilityMultiplier:
    skillModifiers.landingStabilityMultiplier * tackleModifiers.landingStabilityMultiplier,
  detectionClarityMultiplier:
    skillModifiers.detectionClarityMultiplier * tackleModifiers.detectionClarityMultiplier,
  riggingEfficiencyMultiplier:
    skillModifiers.riggingEfficiencyMultiplier * tackleModifiers.riggingEfficiencyMultiplier,
  maxTensionMultiplier: skillModifiers.maxTensionMultiplier * tackleModifiers.maxTensionMultiplier,
  slackToleranceMultiplier:
    skillModifiers.slackToleranceMultiplier * tackleModifiers.slackToleranceMultiplier,
})
