import type { TraitModifiers } from '../../fish/fishTraits'
import { DEFAULT_BATTLE_TUNING, type BattleTuning } from '../BattleTuning'
import { fishMassIndex } from '../fishMassIndex'
import type { FishBattleProfile } from './BattleStep'

/**
 * 魚の「戦い方」を、既存の数値から解決する（Phase 10）。
 *
 * 入力は Content の fightProfile（strength / stamina / speed）、
 * Trait の解決済み倍率、個体サイズ由来の倍率（Phase 9）だけ。
 * 魚種 ID・魚種名・国は一切見ない（Engine に具体分岐を足さない）。
 */
export const resolveFishBattleProfile = (input: {
  /** 魚種の fightProfile。 */
  readonly strength: number
  readonly stamina: number
  readonly speed: number
  /** Trait から合成済みの倍率。 */
  readonly traitModifiers: TraitModifiers
  /** 個体の重さ（kg）。大きさの基準に使う。 */
  readonly weightKg: number
  /** Phase 9: 大型個体の引き（1 が基準サイズ）。 */
  readonly pullMultiplier: number
  /** Phase 9: 大型個体の粘り（1 が基準サイズ）。 */
  readonly enduranceMultiplier: number
  /** Phase 9.1: フック保持の上限（1 が標準）。 */
  readonly hookHoldCapacity?: number
  readonly tuning?: BattleTuning
}): FishBattleProfile => {
  const tuning = input.tuning ?? DEFAULT_BATTLE_TUNING
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value))
  /*
   * Phase 18A: 12.5kg までは従来の線形 sizeFactor と同一、
   * それ以降は sqrt で伸びる sublinear の mass index（fishMassIndex 参照）。
   * これで 30kg と 150kg が同じ魚に潰れなくなる。
   */
  const sizeFactor = fishMassIndex(input.weightKg, tuning)
  const sizeNorm = clamp((sizeFactor - 1) / 3, 0, 1)
  const runBoost = input.traitModifiers.runChanceMultiplier - 1
  const durationBoost = input.traitModifiers.runDurationMultiplier - 1
  const strength = clamp(input.strength, 0, 1)
  const speed = clamp(input.speed, 0, 1)

  return {
    sizeFactor,
    runTendency: clamp(0.25 + 0.55 * speed + 0.35 * runBoost + 0.2 * durationBoost, 0.05, 1),
    aggression: clamp(0.2 + 0.5 * speed + 0.4 * runBoost + 0.2 * strength, 0.05, 1),
    diveTendency: clamp(0.2 + 0.45 * strength + 0.35 * sizeNorm - 0.25 * speed, 0.05, 1),
    headShakeTendency: clamp(0.25 + 0.45 * strength + 0.3 * runBoost, 0.05, 1),
    burstPower: clamp(input.pullMultiplier, 0.5, 3),
    endurance: clamp(input.enduranceMultiplier, 0.4, 2.5),
    hookHoldCapacity: clamp(input.hookHoldCapacity ?? 1, 0.3, 1),
  }
}
