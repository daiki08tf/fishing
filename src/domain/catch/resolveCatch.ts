import { recordCatch, toRecordEntry, type CatchRecordOutcome, type CodexState } from '../codex'
import type { FishIndividual } from '../fish/FishIndividual'
import type { FishSpecies } from '../fish/FishSpecies'
import type { AnglerProgression } from '../progression/AnglerProgression'
import { applyCatchToProgression, type ProgressionUpdate } from '../progression/progressionService'
import type { ProgressionTuning } from '../progression/ProgressionTuning'
import { repetitionCountForSpecies } from '../progression/repetitionDecay'
import { calculateCatchXp, type XpBreakdown } from '../progression/xpCalculation'

/**
 * 1 匹の捕獲を、記録と成長へまとめて反映する。
 *
 * 処理順序（UI が独自判定しないための唯一の入口）:
 *
 *   Fish LANDED
 *     ↓
 *   Record 判定（Codex）
 *     ↓
 *   First Catch / Personal Record 判定
 *     ↓
 *   XP 計算（Progression）
 *     ↓
 *   Progression 更新（Level / Skill Point / Perk）
 *
 * UI は結果を受け取って表示するだけである。
 */

export type CatchResolution = {
  readonly codex: CodexState
  readonly progression: AnglerProgression
  readonly record: CatchRecordOutcome
  readonly xp: XpBreakdown
  readonly progressionUpdate: ProgressionUpdate
}

export type ResolveCatchInput = {
  readonly individual: FishIndividual
  readonly species: FishSpecies
  readonly codex: CodexState
  readonly progression: AnglerProgression
  readonly capturedAt?: string
  readonly spotId?: string
  readonly methodId?: string
  readonly tuning?: ProgressionTuning
}

export const resolveCatch = (input: ResolveCatchInput): CatchResolution => {
  const speciesKey = String(input.individual.speciesId)

  // 1. 記録の更新（Codex）。
  const record = recordCatch(input.codex, toRecordEntry(input.individual, input.capturedAt))

  // 2. 判定結果を使って XP を計算する。
  const repetitionCount = repetitionCountForSpecies(input.progression.repetition, speciesKey) + 1
  const xp = calculateCatchXp({
    species: { id: input.individual.speciesId, rarity: input.species.rarity },
    percentile: input.individual.percentile ?? 0,
    traits: input.individual.traits,
    firstCatch: record.isFirstCatchOfSpecies,
    personalRecord: record.isPersonalBest,
    newSpot:
      input.spotId !== undefined && input.progression.repetition.spots[input.spotId] === undefined,
    newMethod:
      input.methodId !== undefined &&
      input.progression.repetition.methods[input.methodId] === undefined,
    repetitionCount,
    ...(input.tuning === undefined ? {} : { tuning: input.tuning }),
  })

  // 3. 成長の更新（Level / Skill Point / Perk）。
  const progressionUpdate = applyCatchToProgression({
    progression: input.progression,
    xp,
    speciesId: speciesKey,
    ...(input.spotId === undefined ? {} : { spotId: input.spotId }),
    ...(input.methodId === undefined ? {} : { methodId: input.methodId }),
    ...(input.tuning === undefined ? {} : { tuning: input.tuning }),
  })

  return {
    codex: record.state,
    progression: progressionUpdate.progression,
    record,
    xp,
    progressionUpdate,
  }
}
