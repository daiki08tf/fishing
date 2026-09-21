import { emptyAnglerSkills } from './AnglerSkill'
import { emptyRepetitionState, type RepetitionState } from './repetitionDecay'
import type { PerkId } from './perks'
import type { AnglerSkills } from './PlayerProgression'
import { DEFAULT_PROGRESSION_TUNING, type ProgressionTuning } from './ProgressionTuning'
import { xpToNextLevel } from './AnglerLevel'

/**
 * Angler の成長状態。
 *
 * DATA_MODEL.md §11 の PlayerProgression を、Phase 3 で必要になった分だけ拡張したもの。
 * Level / XP / Skill Point / Skill / Perk / 反復状態を 1 つにまとめる。
 *
 * FishingEngine はこの型を知らない（Engine へは解決済みの倍率だけを渡す）。
 */

export type AnglerProgression = {
  readonly anglerLevel: number
  /** 現在レベル内の XP。 */
  readonly anglerXp: number
  /** 累計 XP。 */
  readonly totalXp: number
  /** 未使用の Skill Point。 */
  readonly skillPoints: number
  readonly skills: AnglerSkills
  readonly unlockedPerks: readonly PerkId[]
  readonly repetition: RepetitionState
  /** Reputation は別軸（Phase 3 では未実装。値だけ保持する）。 */
  readonly reputation: number
  readonly methodProficiency: Readonly<Record<string, number>>
}

export const createInitialProgression = (): AnglerProgression => ({
  anglerLevel: 1,
  anglerXp: 0,
  totalXp: 0,
  skillPoints: 0,
  skills: emptyAnglerSkills(),
  unlockedPerks: [],
  repetition: emptyRepetitionState(),
  reputation: 0,
  methodProficiency: {},
})

/** 次のレベルまでに必要な XP（最大レベルでは 0）。 */
export const xpToNext = (
  progression: AnglerProgression,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => xpToNextLevel(progression.anglerLevel, tuning)

/** レベル内の進捗（0〜1）。最大レベルでは 1。 */
export const xpProgress = (
  progression: AnglerProgression,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  const required = xpToNext(progression, tuning)

  if (required <= 0) {
    return 1
  }

  return Math.min(1, Math.max(0, progression.anglerXp / required))
}

export const isMaxLevel = (
  progression: AnglerProgression,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): boolean => progression.anglerLevel >= tuning.maxLevel
