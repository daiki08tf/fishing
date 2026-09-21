import type { FishSpecies } from '../fish/FishSpecies'
import { offeringTagsOf, type GearItem, type GearCategory } from '../gear/Gear'
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

  const playerModifiers: PlayerFishingModifiers = {
    ...NEUTRAL_FISHING_MODIFIERS,
    // ロッドの主導権とラインの伸びがテンション上昇を抑える。
    tensionGainMultiplier: clamp(
      (1 - tuning.rodControlStrength * rod.control) * (1 - tuning.lineStretchRelief * line.stretch),
      0.4,
      1,
    ),
    // ロッドの寄せる力とラインの強さが「耐えられるテンション」を上げる。
    maxTensionMultiplier: clamp(
      lineTensionBonus + tuning.rodFightingStrength * rod.fightingPower + leaderBonus,
      0.8,
      1.8,
    ),
    // リールのドラッグと滑らかさ。
    reelEfficiencyMultiplier: clamp(
      1 +
        tuning.reelDragStrength * (reel.maxDragKg / 10) +
        tuning.reelSmoothnessStrength * reel.smoothness,
      0.7,
      1.8,
    ),
    giveEfficiencyMultiplier: clamp(1 + tuning.reelSmoothnessStrength * reel.smoothness, 0.8, 1.5),
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
    hookSuccessModifier: tuning.hookPenetrationStrength * hook.penetration,
    slackToleranceMultiplier: clamp(1 + tuning.hookHoldingStrength * hook.holdingPower, 0.8, 1.6),
    landingStabilityMultiplier: clamp(1 + 0.3 * rod.fightingPower, 0.8, 1.4),
    riggingEfficiencyMultiplier: 1,
  }

  // ヒットの出やすさ: ライン/リーダーの見えにくさ × 釣法 × 相性。
  const stealth = 0.85 + 0.3 * line.visibility + (leader === null ? 0 : 0.1 * leader.visibility)
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
