import type {
  LineDefinition,
  OfferingDefinition,
  ReelDefinition,
  RodDefinition,
} from '../gear/Gear'
import type { RandomSource } from '../rng/RandomSource'
import { resolveEffectiveLineCapacityM } from '../tackle/lineCapacity'
import type { FishOccurrence } from '../world/FishOccurrence'
import type { FishingSpot, FishingZone } from '../world/FishingSpot'

/**
 * Phase 11 — Casting Distance & Fishing Zones.
 *
 * ここに置くのは「現実スペックをゲーム内の到達距離へ写す」調整ロジック。
 * Gear / Spot の具体 ID や魚種 ID では分岐しない。
 */

export type CastCapability = {
  /** 安定して狙える距離。これ以内なら Zone の奥まで届きやすい。 */
  readonly comfortableDistanceM: number
  /** 物理的に届き得る上限。ライン残量も含めて制限する。 */
  readonly maxDistanceM: number
  /** 狙った距離へ落とす精度（0〜1）。 */
  readonly precision: number
  /** ファイト用に残すライン長。 */
  readonly reserveLineM: number
}

export type CastTargetStatus = 'comfortable' | 'reachable' | 'marginal' | 'unreachable'

export type CastQuality = 'clean' | 'short' | 'long'

export type ResolvedCast =
  | {
      readonly reachable: false
      readonly targetZoneId: string
      readonly status: 'unreachable'
    }
  | {
      readonly reachable: true
      readonly targetZoneId: string
      readonly landedZoneId: string
      readonly status: Exclude<CastTargetStatus, 'unreachable'>
      readonly actualDistanceM: number
      readonly quality: CastQuality
    }

export type CastingTuning = {
  readonly defaultBaitRigWeightG: number
  readonly reserveLineM: number
  readonly minComfortableDistanceM: number
  readonly distanceSpanM: number
  readonly maxHardCapM: number
  readonly windyDistanceMultiplier: number
  readonly windyPrecisionMultiplier: number
}

export const DEFAULT_CASTING_TUNING: CastingTuning = {
  defaultBaitRigWeightG: 18,
  reserveLineM: 25,
  minComfortableDistanceM: 10,
  distanceSpanM: 82,
  maxHardCapM: 120,
  windyDistanceMultiplier: 0.88,
  windyPrecisionMultiplier: 0.82,
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const clamp01 = (value: number): number => clamp(value, 0, 1)
const round1 = (value: number): number => Math.round(value * 10) / 10

const offeringWeightG = (offering: OfferingDefinition, tuning: CastingTuning): number =>
  offering.category === 'lure' ? offering.weightG : tuning.defaultBaitRigWeightG

/**
 * ロッドの適正ルアー重量に対するキャスト効率。
 * 重ければ無条件に飛ぶのではなく、ロッドの適正域の中央付近を高くする。
 */
const offeringWeightFit = (
  rod: RodDefinition,
  offering: OfferingDefinition,
  tuning: CastingTuning,
): number => {
  const weight = Math.max(0.1, offeringWeightG(offering, tuning))
  const min = Math.max(0.1, rod.minLureWeightG)
  const max = Math.max(min, rod.maxLureWeightG)

  if (weight < min) {
    return clamp(0.45 + 0.4 * (weight / min), 0.35, 0.85)
  }

  if (weight > max) {
    return clamp(0.75 - 0.3 * ((weight - max) / Math.max(1, max)), 0.35, 0.75)
  }

  const center = Math.sqrt(min * max)
  const halfSpan = Math.max(0.1, Math.log(max / min) / 2)
  const offset = Math.abs(Math.log(weight / center))

  return clamp(1 - 0.22 * (offset / halfSpan), 0.78, 1)
}

export const resolveCastCapability = (input: {
  readonly rod: RodDefinition
  readonly reel: ReelDefinition
  readonly line: LineDefinition
  readonly offering: OfferingDefinition
  /** FishingMethod の castDistance（0〜1）。 */
  readonly methodCastDistance: number
  /** Progression 由来。1 が標準。装備側の casting 値はここへ重ねない。 */
  readonly skillCastingMultiplier: number
  readonly windy: boolean
  readonly tuning?: CastingTuning
}): CastCapability => {
  const tuning = input.tuning ?? DEFAULT_CASTING_TUNING
  const rodLength = clamp01((input.rod.lengthM - 1.5) / (3.9 - 1.5))
  const thinLine = 1 - clamp01((input.line.diameterMm - 0.08) / (0.5 - 0.08))
  const weightFit = offeringWeightFit(input.rod, input.offering, tuning)
  const method = clamp01(input.methodCastDistance)

  const distanceScore = clamp01(
    0.42 * input.rod.castingProfile +
      0.14 * rodLength +
      0.2 * weightFit +
      0.12 * thinLine +
      0.06 * input.reel.control +
      0.06 * method,
  )

  const skillDistanceMultiplier = clamp(1 + (input.skillCastingMultiplier - 1) * 0.18, 0.9, 1.12)
  const windDistanceMultiplier = input.windy ? tuning.windyDistanceMultiplier : 1

  const precisionBase =
    0.34 +
    0.24 * input.rod.control +
    0.18 * input.reel.control +
    0.12 * input.rod.castingProfile +
    0.12 * clamp01((input.skillCastingMultiplier - 0.8) / 0.8)
  const precision = clamp(
    precisionBase * (input.windy ? tuning.windyPrecisionMultiplier : 1),
    0.25,
    0.98,
  )

  const rawComfortable =
    (tuning.minComfortableDistanceM + tuning.distanceSpanM * distanceScore) *
    skillDistanceMultiplier *
    windDistanceMultiplier
  const rawMax = rawComfortable * (1.2 + 0.12 * precision)

  // ライン容量は共有 resolver（tackle/lineCapacity）が唯一の authority。
  const capacityM = resolveEffectiveLineCapacityM(input.reel, input.line)
  const lineLimitedMax =
    capacityM === null ? tuning.maxHardCapM : Math.max(8, capacityM - tuning.reserveLineM)
  const maxDistanceM = Math.min(rawMax, lineLimitedMax, tuning.maxHardCapM)
  const comfortableDistanceM = Math.min(rawComfortable, maxDistanceM * 0.82)

  return {
    comfortableDistanceM: round1(Math.max(5, comfortableDistanceM)),
    maxDistanceM: round1(Math.max(8, maxDistanceM)),
    precision: round1(precision),
    reserveLineM: tuning.reserveLineM,
  }
}

/**
 * 旧 Spot は Zone を持たなくても遊べる。
 * Phase 12 以降で Content を増やす間の互換レイヤー。
 */
export const fishingZonesForSpot = (spot: FishingSpot): readonly FishingZone[] => {
  if (spot.fishingZones !== undefined && spot.fishingZones.length > 0) {
    return spot.fishingZones
  }

  const maxDistance =
    spot.environment === 'river'
      ? 40
      : spot.environment === 'estuary'
        ? 55
        : spot.environment === 'lake'
          ? 65
          : spot.environment === 'managed_pond'
            ? 30
            : spot.environment === 'bay_shore'
              ? 75
              : 50

  return [
    {
      id: 'main',
      name: '主なポイント',
      castDistanceM: { min: 0, max: maxDistance },
      habitatTags: spot.habitatTags,
    },
  ]
}

export const castTargetStatus = (
  zone: FishingZone,
  capability: CastCapability,
): CastTargetStatus => {
  const range = zone.castDistanceM

  if (range === undefined) {
    return 'comfortable'
  }

  if (capability.maxDistanceM < range.min) {
    return 'unreachable'
  }

  if (capability.comfortableDistanceM >= range.max) {
    return 'comfortable'
  }

  if (capability.comfortableDistanceM >= range.min) {
    return 'reachable'
  }

  return 'marginal'
}

const distanceToRange = (distanceM: number, zone: FishingZone): number => {
  const range = zone.castDistanceM

  if (range === undefined) {
    return 0
  }

  if (distanceM < range.min) {
    return range.min - distanceM
  }

  if (distanceM > range.max) {
    return distanceM - range.max
  }

  return 0
}

const landedZoneFor = (
  zones: readonly FishingZone[],
  target: FishingZone,
  distanceM: number,
): FishingZone => {
  const targetRange = target.castDistanceM

  if (targetRange === undefined || (distanceM >= targetRange.min && distanceM <= targetRange.max)) {
    return target
  }

  const containing = zones.find((zone) => {
    const range = zone.castDistanceM
    return range !== undefined && distanceM >= range.min && distanceM <= range.max
  })

  if (containing !== undefined) {
    return containing
  }

  return (
    [...zones].sort(
      (left, right) => distanceToRange(distanceM, left) - distanceToRange(distanceM, right),
    )[0] ?? target
  )
}

/**
 * 1 回のキャストを決定論的に解決する。
 *
 * 「最大パワーを目押し」ではなく Zone を選び、タックル性能と精度で実着水点が決まる。
 * ギリギリの Zone は手前へ落ちることがある。
 */
export const resolveCast = (input: {
  readonly zones: readonly FishingZone[]
  readonly targetZoneId: string
  readonly capability: CastCapability
  readonly random: RandomSource
}): ResolvedCast => {
  const target = input.zones.find((zone) => zone.id === input.targetZoneId) ?? input.zones[0]

  if (target === undefined) {
    return { reachable: false, targetZoneId: input.targetZoneId, status: 'unreachable' }
  }

  const status = castTargetStatus(target, input.capability)

  if (status === 'unreachable') {
    return { reachable: false, targetZoneId: target.id, status }
  }

  const range = target.castDistanceM

  if (range === undefined) {
    return {
      reachable: true,
      targetZoneId: target.id,
      landedZoneId: target.id,
      status,
      actualDistanceM: 0,
      quality: 'clean',
    }
  }

  const targetDistance = range.min + (range.max - range.min) * 0.55
  const desiredDistance = Math.min(targetDistance, input.capability.maxDistanceM)
  const beyondComfort = clamp01(
    (desiredDistance - input.capability.comfortableDistanceM) /
      Math.max(1, input.capability.maxDistanceM - input.capability.comfortableDistanceM),
  )
  const spreadM = 1.5 + 9 * (1 - input.capability.precision) + 7 * beyondComfort
  const shortBiasM = spreadM * (0.12 + 0.38 * beyondComfort)
  const randomErrorM = (input.random.next() - 0.5) * 2 * spreadM
  const actualDistanceM = round1(
    clamp(desiredDistance + randomErrorM - shortBiasM, 0, input.capability.maxDistanceM),
  )
  const landed = landedZoneFor(input.zones, target, actualDistanceM)

  const quality: CastQuality =
    landed.id === target.id ? 'clean' : actualDistanceM < range.min ? 'short' : 'long'

  return {
    reachable: true,
    targetZoneId: target.id,
    landedZoneId: landed.id,
    status,
    actualDistanceM,
    quality,
  }
}

/** Zone を選んだことによる presence 倍率。未指定なら従来どおり 1。 */
export const zoneAffinityMultiplier = (occurrence: FishOccurrence, zoneId: string): number =>
  Math.max(0, occurrence.zoneAffinity?.[zoneId] ?? 1)
