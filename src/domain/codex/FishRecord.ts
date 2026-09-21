import type { FishIndividualId, FishSpeciesId } from '../ids'
import type { FishTrait } from '../fish/FishTrait'

/**
 * Codex / Record の最小モデル。
 *
 * Phase 2 では「Domain として記録できる」ことだけを目的にする。
 * 本格的な図鑑 UI と Save への永続化は後 Phase。
 *
 * 世界中の魚を記録するのではなく、プレイヤーが実際に捕獲した個体だけを持つ。
 */

/** 捕獲した 1 個体の記録。 */
export type FishRecordEntry = {
  readonly individualId: FishIndividualId
  readonly speciesId: FishSpeciesId
  readonly lengthCm: number
  readonly weightKg: number
  readonly condition: number
  /** 同種サイズ分布での百分位（0〜100）。 */
  readonly percentile: number
  readonly traits: readonly FishTrait[]
  readonly capturedAt?: string
}

/** 魚種ごとの集計。 */
export type SpeciesRecord = {
  readonly speciesId: FishSpeciesId
  readonly catchCount: number
  readonly largestLengthCm: number
  readonly heaviestWeightKg: number
  /** 最も珍しいサイズ（百分位の最大）。 */
  readonly bestPercentile: number
  /** これまでに捕獲した Trait の種類。 */
  readonly caughtTraits: readonly FishTrait[]
  /** 自己記録の個体。百分位で選ぶ。 */
  readonly personalBest: FishRecordEntry
}

export type CodexState = {
  readonly species: Readonly<Record<string, SpeciesRecord>>
}

export const emptyCodexState = (): CodexState => ({ species: {} })
