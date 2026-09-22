import type { RandomSource } from '../rng/RandomSource'
import type { FishingZone } from '../world/FishingSpot'
import { depthTargetStatus, type DepthCapability, type DepthTargetStatus } from './DepthCapability'
import type { DriftStrength } from './Drift'

export type DeploymentQuality = 'clean' | 'shallow' | 'deep' | 'drifted'

export type ResolvedDeployment =
  | {
      readonly reachable: false
      readonly targetZoneId: string
      readonly status: 'unreachable'
    }
  | {
      readonly reachable: true
      readonly targetZoneId: string
      readonly landedZoneId: string
      readonly status: Exclude<DepthTargetStatus, 'unreachable'>
      readonly targetDepthM: number
      readonly actualDepthM: number
      readonly quality: DeploymentQuality
    }

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const clamp01 = (value: number): number => clamp(value, 0, 1)
const round1 = (value: number): number => Math.round(value * 10) / 10

const distanceToRange = (depthM: number, zone: FishingZone): number => {
  const range = zone.depthRangeM

  if (range === undefined) {
    return 0
  }

  if (depthM < range.min) {
    return range.min - depthM
  }

  if (depthM > range.max) {
    return depthM - range.max
  }

  return 0
}

const landedZoneFor = (
  zones: readonly FishingZone[],
  target: FishingZone,
  depthM: number,
): FishingZone => {
  const targetRange = target.depthRangeM

  if (targetRange === undefined || (depthM >= targetRange.min && depthM <= targetRange.max)) {
    return target
  }

  const containing = zones.find((zone) => {
    const range = zone.depthRangeM
    return range !== undefined && depthM >= range.min && depthM <= range.max
  })

  if (containing !== undefined) {
    return containing
  }

  return (
    [...zones].sort(
      (left, right) => distanceToRange(depthM, left) - distanceToRange(depthM, right),
    )[0] ?? target
  )
}

/**
 * 深場（vertical / drift）への 1 回の投入を決定論的に解決する（Phase 17A）。
 *
 * `resolveCast`（Casting Domain）と同じ考え方: 目押しの操作ゲームにはせず、
 * 狙う Zone を選び、DepthCapability と精度から実際の到達水深が決まる。
 * ギリギリの Zone は浅め／深めに逸れることがある。
 *
 * `drift`（Phase 17B, `resolveDriftStrength` で既存の Spot.current から derive）が
 * 'slow' 以外で、かつ Zone を外れたときは `quality: 'drifted'` にする
 * （狙いが甘かったのではなく、潮に流された、という区別）。
 */
export const resolveDeployment = (input: {
  readonly zones: readonly FishingZone[]
  readonly targetZoneId: string
  readonly capability: DepthCapability
  readonly random: RandomSource
  /** 省略時は 'slow'（潮の影響なし）。 */
  readonly drift?: DriftStrength
}): ResolvedDeployment => {
  const drift = input.drift ?? 'slow'
  const target = input.zones.find((zone) => zone.id === input.targetZoneId) ?? input.zones[0]

  if (target === undefined) {
    return { reachable: false, targetZoneId: input.targetZoneId, status: 'unreachable' }
  }

  const status = depthTargetStatus(target, input.capability)

  if (status === 'unreachable') {
    return { reachable: false, targetZoneId: target.id, status }
  }

  const range = target.depthRangeM

  if (range === undefined) {
    return {
      reachable: true,
      targetZoneId: target.id,
      landedZoneId: target.id,
      status,
      targetDepthM: 0,
      actualDepthM: 0,
      quality: 'clean',
    }
  }

  const targetDepth = range.min + (range.max - range.min) * 0.5
  const desiredDepth = Math.min(targetDepth, input.capability.maxDepthM)
  const beyondComfort = clamp01(
    (desiredDepth - input.capability.comfortableDepthM) /
      Math.max(1, input.capability.maxDepthM - input.capability.comfortableDepthM),
  )
  const driftSpreadBonusM = drift === 'fast' ? 7 : drift === 'moderate' ? 3 : 0
  const spreadM = 1 + 6 * (1 - input.capability.control) + 5 * beyondComfort + driftSpreadBonusM
  const randomErrorM = (input.random.next() - 0.5) * 2 * spreadM
  const actualDepthM = round1(clamp(desiredDepth + randomErrorM, 0, input.capability.maxDepthM))
  const landed = landedZoneFor(input.zones, target, actualDepthM)

  const missed = landed.id !== target.id
  const quality: DeploymentQuality = !missed
    ? 'clean'
    : drift !== 'slow'
      ? 'drifted'
      : actualDepthM < range.min
        ? 'shallow'
        : 'deep'

  return {
    reachable: true,
    targetZoneId: target.id,
    landedZoneId: landed.id,
    status,
    targetDepthM: round1(targetDepth),
    actualDepthM,
    quality,
  }
}
