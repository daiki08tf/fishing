import { DEFAULT_PROGRESSION_TUNING, type ProgressionTuning } from './ProgressionTuning'

/**
 * Angler Level（Lv1〜100）と XP カーブ。
 *
 * PROGRESSION.md §2 のとおり、Level は「本人の総合経験・技量」であり、
 * 地域の入場キーにはしない（DECISIONS.md §5 / §6）。
 *
 * レベル計算を UI に置かないため、すべてここに閉じる。
 */

export const MIN_ANGLER_LEVEL = 1

/** 現在のレベルから次へ上がるのに必要な XP。最大レベルでは 0。 */
export const xpToNextLevel = (
  level: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  if (level >= tuning.maxLevel) {
    return 0
  }

  const safeLevel = Math.max(MIN_ANGLER_LEVEL, Math.trunc(level))
  return Math.round(tuning.levelXpBase + tuning.levelXpScale * safeLevel ** tuning.levelXpExponent)
}

/** レベル 1 から指定レベルまでに必要な累計 XP。 */
export const totalXpForLevel = (
  level: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  const target = Math.min(Math.max(Math.trunc(level), MIN_ANGLER_LEVEL), tuning.maxLevel)
  let total = 0

  for (let current = MIN_ANGLER_LEVEL; current < target; current += 1) {
    total += xpToNextLevel(current, tuning)
  }

  return total
}

/** レベルの上昇に必要な Skill Point。レベルごとに 1、節目で +1。 */
export const skillPointsForLevel = (
  level: number,
  tuning: ProgressionTuning = DEFAULT_PROGRESSION_TUNING,
): number => {
  const bonus = tuning.bonusSkillPointLevels.includes(level) ? tuning.bonusSkillPoints : 0
  return tuning.skillPointsPerLevel + bonus
}

export type LevelUpOutcome = {
  readonly level: number
  /** レベル内の残り XP（次レベルまでの進捗）。 */
  readonly xp: number
  readonly totalXp: number
  /** 上がったレベルの一覧（複数同時上昇に対応）。 */
  readonly levelsGained: readonly number[]
  readonly skillPointsGained: number
}

/**
 * XP を加算してレベルを進める。
 *
 * 大量 XP で複数レベル同時に上がる場合も、
 * 通過した各レベル分の Skill Point を正しく加算する。
 * 最大レベルに達したら XP はそこで止め、溢れさせない。
 */
export const addXp = (options: {
  readonly level: number
  readonly xp: number
  readonly totalXp: number
  readonly gained: number
  readonly tuning?: ProgressionTuning
}): LevelUpOutcome => {
  const tuning = options.tuning ?? DEFAULT_PROGRESSION_TUNING
  const gained = Math.max(0, Math.round(options.gained))

  let level = Math.min(Math.max(Math.trunc(options.level), MIN_ANGLER_LEVEL), tuning.maxLevel)
  let xp = Math.max(0, options.xp)
  const totalXp = Math.max(0, options.totalXp) + gained
  let remaining = gained
  const levelsGained: number[] = []
  let skillPointsGained = 0

  while (level < tuning.maxLevel) {
    const required = xpToNextLevel(level, tuning)

    if (remaining < required - xp) {
      xp += remaining
      break
    }

    remaining -= required - xp
    level += 1
    xp = 0
    levelsGained.push(level)
    skillPointsGained += skillPointsForLevel(level, tuning)
  }

  if (level >= tuning.maxLevel) {
    // 上限に達したら、それ以上 XP を溜めない。
    level = tuning.maxLevel
    xp = 0
  }

  return { level, xp, totalXp, levelsGained, skillPointsGained }
}
