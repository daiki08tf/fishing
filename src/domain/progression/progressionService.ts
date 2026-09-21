import { addXp, type LevelUpOutcome } from './AnglerLevel'
import type { AnglerProgression } from './AnglerProgression'
import { unlockPerks, type PerkId } from './perks'
import { incrementRepetition } from './repetitionDecay'
import { DEFAULT_PROGRESSION_TUNING, type ProgressionTuning } from './ProgressionTuning'
import type { XpBreakdown } from './xpCalculation'

/**
 * 成長の更新。捕獲 1 件を Progression へ反映する。
 *
 * 順序（ARCHITECTURE の層の考え方に合わせる）:
 *   1. 反復カウントを進める
 *   2. XP を加算し、複数レベル同時上昇も処理する
 *   3. Skill Point を付与する
 *   4. 条件を満たした Perk を解禁する
 *
 * XP の計算そのものは xpCalculation、Codex の更新は codex 側の責務である。
 * ここは「成長状態の更新」だけを行う。
 */

export type ProgressionUpdate = {
  readonly progression: AnglerProgression
  readonly xp: XpBreakdown
  readonly levelsGained: readonly number[]
  readonly skillPointsGained: number
  readonly newlyUnlockedPerks: readonly PerkId[]
  readonly levelUp: LevelUpOutcome
}

export const applyCatchToProgression = (options: {
  readonly progression: AnglerProgression
  readonly xp: XpBreakdown
  readonly speciesId: string
  readonly spotId?: string
  readonly methodId?: string
  readonly tuning?: ProgressionTuning
}): ProgressionUpdate => {
  const tuning = options.tuning ?? DEFAULT_PROGRESSION_TUNING
  const { progression } = options

  const repetition = incrementRepetition(progression.repetition, {
    speciesId: options.speciesId,
    ...(options.spotId === undefined ? {} : { spotId: options.spotId }),
    ...(options.methodId === undefined ? {} : { methodId: options.methodId }),
  })

  const levelUp = addXp({
    level: progression.anglerLevel,
    xp: progression.anglerXp,
    totalXp: progression.totalXp,
    gained: options.xp.total,
    tuning,
  })

  const grown: AnglerProgression = {
    ...progression,
    anglerLevel: levelUp.level,
    anglerXp: levelUp.xp,
    totalXp: levelUp.totalXp,
    skillPoints: progression.skillPoints + levelUp.skillPointsGained,
    repetition,
  }

  const unlock = unlockPerks(grown)

  return {
    progression: unlock.progression,
    xp: options.xp,
    levelsGained: levelUp.levelsGained,
    skillPointsGained: levelUp.skillPointsGained,
    newlyUnlockedPerks: unlock.unlocked,
    levelUp,
  }
}
