import type { FishSpeciesId } from '../ids'
import type { FishBehavior } from './FishBehavior'

/**
 * ファイト対象としての魚。
 *
 * 魚種データ（FishSpecies）から個体を生成した結果であり、
 * Fishing Engine が扱う最小の情報だけを持つ。
 * 「魚種データ」と「釣りの進行」を分離するための境界でもある。
 */
export type FightingFish = {
  readonly speciesId: FishSpeciesId
  readonly name: string

  /** 個体生成に使った seed。再現と表示のために保持する。 */
  readonly individualSeed: string

  readonly lengthCm: number
  readonly weightKg?: number

  /** 引きの強さ（0〜1）。テンションの上がり方に効く。 */
  readonly power: number
  /** 行動の切り替わりやすさ（0〜1）。 */
  readonly speed: number
  /** 最大スタミナ（0〜1 の相対値）。0 になれば取り込める。 */
  readonly staminaMax: number
}

/** ファイト中の可変状態。 */
export type FightingFishState = {
  readonly fish: FightingFish
  readonly stamina: number
  readonly behavior: FishBehavior
  readonly behaviorRunTicksRemaining: number
  /** 糸が緩んでいた連続 tick 数。 */
  readonly slackTicks: number
}
