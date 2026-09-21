import type { FishIndividualId, FishingSpotId, FishSpeciesId } from '../ids'
import type { Normalized } from '../primitives'
import type { FishTrait } from './FishTrait'

/**
 * ヒット時に生成される個体。DATA_MODEL.md §3 に対応する。
 *
 * 世界中の全魚を事前生成しない。保存されるのはプレイヤーが接触した個体のみ。
 */
export type FishIndividual = {
  readonly id: FishIndividualId
  readonly speciesId: FishSpeciesId

  readonly lengthCm: number
  readonly weightKg: number
  readonly condition: Normalized

  readonly traits: readonly FishTrait[]

  /** ファイト再現用の Seed。個体ごとに固定する。 */
  readonly fightSeed: string

  readonly caughtAt?: string
  readonly spotId?: FishingSpotId
  readonly capturedAt?: string

  /** 同種サイズ分布における上位率（0〜100）。 */
  readonly percentile?: number
}
