import { DEFAULT_BATTLE_TUNING, type BattleTuning } from './BattleTuning'
import type { FishBattleProfile } from './battle/BattleStep'
import { fishMassIndex } from './fishMassIndex'

/**
 * Fight Demand（Phase 18A）。
 *
 * 「この個体がファイトで要求してくる負荷」を、FishIndividual（重さ・
 * コンディション・Trait 由来の解決済み値）と fishProfile（strength /
 * stamina / speed）から導出する。**Species ID は一切見ない**。
 *
 * FightCapability（タックル側）と対になる概念で、
 * 2 つの比較が「相対的なチャレンジ度」を生む（fightChallenge 参照）。
 */

export type FightDemand = {
  /** 大きさの指標（fishMassIndex。sublinear・上限なし）。 */
  readonly massLoad: number
  /** 初速・突進の強さ（pullMultiplier × aggression 系）。 */
  readonly burstLoad: number
  /** 粘り（スタミナ × endurance）。 */
  readonly enduranceLoad: number
  /** 走る素養（runTendency × speed）。 */
  readonly runPotential: number
  /** 潜る圧（diveTendency × strength）。 */
  readonly divePressure: number
  /**
   * チャレンジ評価用の kg 換算負荷。
   * 重さに「戦い方の激しさ」（power / stamina / speed）を掛けた値。
   * 現実の引張力ではなく相対評価用のスコア（PROVISIONAL tuning）。
   */
  readonly demandKg: number
  /** 集計スコア（表示・比較用。massLoad ベース）。 */
  readonly total: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))
const clamp01 = (value: number): number => clamp(value, 0, 1)

export const resolveFightDemand = (input: {
  /** 個体の重さ（kg）。 */
  readonly weightKg: number
  /** 解決済みの個体値（createFightingFish の出力）。 */
  readonly power: number
  readonly speed: number
  readonly staminaMax: number
  readonly battleProfile: FishBattleProfile
  readonly tuning?: BattleTuning
}): FightDemand => {
  const tuning = input.tuning ?? DEFAULT_BATTLE_TUNING
  const profile = input.battleProfile

  const massLoad = fishMassIndex(input.weightKg, tuning)
  const burstLoad = clamp01(profile.burstPower / 3) * (0.4 + 0.6 * clamp01(profile.aggression)) * 3
  const enduranceLoad = clamp(input.staminaMax, 0, 1) * profile.endurance
  const runPotential = clamp01(profile.runTendency) * (0.5 + 0.5 * clamp01(input.speed))
  const divePressure = clamp01(profile.diveTendency) * (0.5 + 0.5 * clamp01(input.power))

  /*
   * demandKg: 「魚が瞬間的に出し得る負荷」を体重 kg で表す。
   * 激しく戦う個体ほど体重あたりの負荷が大きい（0.4〜1.2 倍程度）。
   * 大きい魚ほど絶対負荷が大きいのは物理としてそのまま（sublinear にしない —
   * sublinear なのは「ファイトの長さ」の方で、タックルとの相対負荷は線形）。
   */
  const intensity = clamp(
    0.35 + 0.3 * clamp01(input.power) + 0.2 * clamp01(input.staminaMax) + 0.15 * runPotential,
    0.35,
    1.2,
  )
  const demandKg = input.weightKg * intensity

  const total = massLoad * (0.7 + 0.3 * clamp(enduranceLoad, 0, 2))

  return {
    massLoad,
    burstLoad,
    enduranceLoad,
    runPotential,
    divePressure,
    demandKg,
    total,
  }
}
