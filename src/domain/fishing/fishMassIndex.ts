import type { BattleTuning } from './BattleTuning'

/**
 * Phase 18A: 個体の重さ（kg）→「ファイト上の大きさ」指標（旧 sizeFactor）。
 *
 * Phase 17 までは `weightKg / 2.5` を 0.3〜5 に clamp していたため、
 * 約 12.5kg 以上の魚がすべて同じ強さに潰れていた（endgame compression）。
 *
 * ここでは knee（= sizeFactorReferenceKg × sizeFactorMax、既定 12.5kg）までは
 * 従来どおり線形、knee を超えると **sqrt** で伸びる（sublinear・上限なし）。
 *
 *   2kg  → 0.8（従来どおり）
 *   12.5kg → 5.0（knee、従来の上限と連続）
 *   30kg  → 7.7
 *   80kg  → 12.6
 *   150kg → 17.3
 *   450kg → 30.0
 *
 * 150kg の魚が 2kg の 75 倍のアクション数を要求することはない
 * （距離・スタミナ側は別途圧縮される）が、30kg と 150kg が同じ魚に
 * 潰れることもない。係数は PROVISIONAL gameplay tuning。
 */
export const fishMassIndex = (weightKg: number, tuning: BattleTuning): number => {
  const linear = Math.min(
    tuning.sizeFactorMax,
    Math.max(tuning.sizeFactorMin, weightKg / tuning.sizeFactorReferenceKg),
  )
  const kneeWeightKg = tuning.sizeFactorReferenceKg * tuning.sizeFactorMax

  if (weightKg <= kneeWeightKg) {
    return linear
  }

  return tuning.sizeFactorMax * Math.sqrt(weightKg / kneeWeightKg)
}

/**
 * ファイト距離に使う圧縮済みの mass index。
 *
 * mass index 自体は uncapped だが、ゲーム上の「寄せる距離」が無制限に伸びると
 * ファイトが長引きすぎるため、knee 以降は log で強く圧縮する
 * （Phase 11 の castDistanceToFightDistanceMultiplier と同じ発想）。
 */
export const fightDistanceSizeIndex = (massIndex: number, tuning: BattleTuning): number => {
  const knee = tuning.sizeFactorMax

  if (massIndex <= knee) {
    return massIndex
  }

  return knee + Math.log1p((massIndex - knee) / knee) * tuning.bigGameDistanceLogFactor
}
