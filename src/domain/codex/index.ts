export { emptyCodexState } from './FishRecord'
export type { CodexState, FishRecordEntry, SpeciesRecord } from './FishRecord'
export { recordCatch, recordedSpeciesCount, toRecordEntry } from './fishRecordService'
export type { CatchRecordOutcome } from './fishRecordService'
export {
  BIG_GAME_RECORD_MIN_PERCENTILE,
  BIG_GAME_RECORD_MIN_WEIGHT_KG,
  bigGameRecords,
  hasBigGameExperience,
  isBigGameRecord,
} from './bigGameRecords'
export type { BigGameRecord } from './bigGameRecords'
