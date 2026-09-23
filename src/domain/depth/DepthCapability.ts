import type { LineDefinition, OfferingDefinition, ReelDefinition } from '../gear/Gear'
import { resolveEffectiveLineCapacityM } from '../tackle/lineCapacity'
import type { FishingZone } from '../world/FishingSpot'
import type { FishingPlatform } from './FishingPlatform'

/**
 * Depth Capability（Phase 17A）。CastCapability（Casting Domain）の深場版。
 *
 * 「現実スペックをゲーム内の到達水深へ写す」調整ロジック。Gear / Spot の具体 ID や
 * 魚種 ID では分岐しない。ブランドによる魔法的なボーナスも与えない。
 */
export type DepthCapability = {
  /** 安定してコントロールできる水深。 */
  readonly comfortableDepthM: number
  /** 物理的に到達し得る上限（ライン残量を含む）。 */
  readonly maxDepthM: number
  /** 深場でのコントロールのしやすさ（0〜1）。Deployment のブレ幅に効く。 */
  readonly control: number
  /** ファイト用に残すライン長。 */
  readonly reserveLineM: number
}

export type DepthTargetStatus = 'comfortable' | 'reachable' | 'marginal' | 'unreachable'

export type DepthTuning = {
  /** Bait 提示時の仕掛け重量目安（オモリ込み、g）。 */
  readonly defaultBaitRigWeightG: number
  /** このあたりの重量で depth score がほぼ頭打ちになる基準値（g）。 */
  readonly referenceHeavyOfferingWeightG: number
  readonly reserveLineM: number
  readonly minComfortableDepthM: number
  readonly depthSpanM: number
  readonly maxHardCapM: number
  readonly platformControlMultiplier: Readonly<Record<FishingPlatform, number>>
}

export const DEFAULT_DEPTH_TUNING: DepthTuning = {
  defaultBaitRigWeightG: 40,
  referenceHeavyOfferingWeightG: 150,
  reserveLineM: 20,
  minComfortableDepthM: 8,
  depthSpanM: 140,
  maxHardCapM: 260,
  platformControlMultiplier: {
    // shore からこの関数が呼ばれることは想定しない（呼び出し側で canPresentVertically を見る）。
    shore: 0,
    kayak: 0.72,
    nearshore_boat: 0.88,
    offshore_boat: 1,
  },
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const clamp01 = (value: number): number => clamp(value, 0, 1)
const round1 = (value: number): number => Math.round(value * 10) / 10

const offeringWeightG = (offering: OfferingDefinition, tuning: DepthTuning): number =>
  offering.category === 'lure' ? offering.weightG : tuning.defaultBaitRigWeightG

/**
 * 装備スペックと Platform から DepthCapability を解決する。
 *
 * 現在のタックル（Line / Reel / Offering）が既に持つ現実由来のスペックだけを使う。
 * Current / Drift（Phase 17B）や Method presentation は、この関数を差し替えずに
 * 呼び出し側の入力（offering・skillControlMultiplier）から反映する。
 */
export const resolveDepthCapability = (input: {
  readonly reel: ReelDefinition
  readonly line: LineDefinition
  readonly offering: OfferingDefinition
  readonly platform: FishingPlatform
  /** Progression 由来。1 が標準。装備側の control 値はここへ重ねない。 */
  readonly skillControlMultiplier?: number
  readonly tuning?: DepthTuning
}): DepthCapability => {
  const tuning = input.tuning ?? DEFAULT_DEPTH_TUNING
  const weight = offeringWeightG(input.offering, tuning)
  const weightScore = clamp01(weight / tuning.referenceHeavyOfferingWeightG)
  const thinLine = 1 - clamp01((input.line.diameterMm - 0.1) / (0.6 - 0.1))
  const reelPower = clamp01(0.5 * input.reel.control + 0.5 * (input.reel.windingTorque ?? 0.5))
  const platformControl = tuning.platformControlMultiplier[input.platform]
  const skillMultiplier = clamp(input.skillControlMultiplier ?? 1, 0.85, 1.15)

  const depthScore = clamp01(
    0.35 * weightScore + 0.2 * thinLine + 0.2 * reelPower + 0.25 * platformControl,
  )

  const rawComfortable =
    (tuning.minComfortableDepthM + tuning.depthSpanM * depthScore) * skillMultiplier
  const control = clamp(0.25 + 0.4 * reelPower + 0.35 * platformControl, 0.15, 1)
  const rawMax = rawComfortable * (1.2 + 0.2 * control)

  // ライン容量は共有 resolver（tackle/lineCapacity）が唯一の authority。
  const capacityM = resolveEffectiveLineCapacityM(input.reel, input.line)
  const lineLimitedMax =
    capacityM === null ? tuning.maxHardCapM : Math.max(6, capacityM - tuning.reserveLineM)
  const maxDepthM = Math.min(rawMax, lineLimitedMax, tuning.maxHardCapM)
  const comfortableDepthM = Math.min(rawComfortable, maxDepthM * 0.82)

  return {
    comfortableDepthM: round1(Math.max(3, comfortableDepthM)),
    maxDepthM: round1(Math.max(5, maxDepthM)),
    control: round1(control),
    reserveLineM: tuning.reserveLineM,
  }
}

/**
 * Zone の depthRangeM に対する到達可否。CastCapability の castTargetStatus と同じ形。
 *
 * `unreachable` は物理的に無理なときだけ（ライン容量 + reserve を含めても届かない）。
 * 「このタックルではこの魚種は釣れない」という Species 分岐にはしない。
 */
export const depthTargetStatus = (
  zone: FishingZone,
  capability: DepthCapability,
): DepthTargetStatus => {
  const range = zone.depthRangeM

  if (range === undefined) {
    return 'comfortable'
  }

  if (capability.maxDepthM < range.min) {
    return 'unreachable'
  }

  if (capability.comfortableDepthM >= range.max) {
    return 'comfortable'
  }

  if (capability.comfortableDepthM >= range.min) {
    return 'reachable'
  }

  return 'marginal'
}
