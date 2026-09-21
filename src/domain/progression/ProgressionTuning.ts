import type { FishTrait } from '../fish/FishTrait'

/**
 * PROVISIONAL — 成長（Angler Progression）の調整値。
 *
 * DATA_MODEL.md §12 の分離に従い、現実データとゲーム調整値を混ぜない。
 * ここにあるのは「ゲームとして面白くなるように決めた数値」である。
 *
 * レベルカーブは PROGRESSION.md §2 の考え方
 * （序盤は上がりやすく、後半ほど必要 XP が増える）に従う。
 */

export type SizeBand = {
  /** この百分位以上で適用する。 */
  readonly minPercentile: number
  readonly multiplier: number
  readonly label: string
}

export type DecayBand = {
  /** この匹数以下（その魚種の通算捕獲数）。 */
  readonly upTo: number
  readonly multiplier: number
}

export type ProgressionTuning = {
  readonly maxLevel: number

  /** XP カーブ: xpToNext(level) = base + scale * level^exponent。 */
  readonly levelXpBase: number
  readonly levelXpScale: number
  readonly levelXpExponent: number

  readonly skillPointsPerLevel: number
  /** ボーナス Skill Point を与えるレベル。 */
  readonly bonusSkillPointLevels: readonly number[]
  readonly bonusSkillPoints: number

  /** Base XP = base * (1 + rarityStep * (rarity - 1))。 */
  readonly baseCatchXp: number
  readonly rarityXpStep: number

  /** サイズ上位率による倍率。降順に並べ、最初に一致したものを適用する。 */
  readonly sizeBands: readonly SizeBand[]

  /** 個体 Trait による Challenge 倍率。 */
  readonly challengeTraitMultipliers: Readonly<Record<FishTrait, number>>
  readonly maxChallengeMultiplier: number

  readonly firstCatchBonus: number
  readonly personalRecordBonus: number
  readonly newSpotBonus: number
  readonly newMethodBonus: number
  readonly trophyBonus: number
  readonly traitBonus: number

  /** 1 回の捕獲で得られる XP の上限（異常値の防止）。 */
  readonly maxCatchXp: number

  readonly decayBands: readonly DecayBand[]
}

export const DEFAULT_PROGRESSION_TUNING: ProgressionTuning = {
  maxLevel: 100,

  levelXpBase: 80,
  levelXpScale: 12,
  levelXpExponent: 1.55,

  skillPointsPerLevel: 1,
  bonusSkillPointLevels: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  bonusSkillPoints: 1,

  baseCatchXp: 10,
  rarityXpStep: 0.5,

  sizeBands: [
    { minPercentile: 99.9, multiplier: 8, label: 'top 0.1%' },
    { minPercentile: 99, multiplier: 3, label: 'top 1%' },
    { minPercentile: 90, multiplier: 1.5, label: 'top 10%' },
    { minPercentile: 0, multiplier: 1, label: 'normal' },
  ],

  challengeTraitMultipliers: {
    trophy: 1.25,
    strong_runner: 1.15,
    heavy: 1.05,
    old: 1.1,
    scarred: 1,
    aggressive: 1.1,
  },
  maxChallengeMultiplier: 2,

  firstCatchBonus: 100,
  personalRecordBonus: 40,
  newSpotBonus: 50,
  newMethodBonus: 50,
  trophyBonus: 60,
  traitBonus: 10,

  maxCatchXp: 2000,

  decayBands: [
    { upTo: 5, multiplier: 1 },
    { upTo: 10, multiplier: 0.8 },
    { upTo: 20, multiplier: 0.6 },
    { upTo: 50, multiplier: 0.3 },
    { upTo: Number.POSITIVE_INFINITY, multiplier: 0.1 },
  ],
}
