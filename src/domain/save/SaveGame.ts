import type { CareerState } from '../career/CareerState'
import type { FinanceState } from '../economy/FinanceState'
import type { IsoDateTime } from '../primitives'
import type { KnowledgeState } from '../knowledge/KnowledgeState'
import type { PlayerProgression } from '../progression/PlayerProgression'

/**
 * 現在の Save schema version。ARCHITECTURE.md §9 に対応する。
 *
 * 破壊的変更時は必ず version を上げ、Migration を用意する。
 */
export const CURRENT_SAVE_SCHEMA_VERSION = 1 as const

export type SaveSchemaVersion = typeof CURRENT_SAVE_SCHEMA_VERSION

/**
 * Save schema v1。
 *
 * Phase 0B では、DATA_MODEL.md が型として定義済みの状態のみを含む。
 * ARCHITECTURE.md §9 が挙げる player / inventory / codex / world は
 * 設計文書側で型が未定義のため、Phase 0B では意図的に含めない
 * （コアループ実装時に schema v2 として追加する）。
 *
 * 初期値ファクトリは用意しない。開始時の資金・職種・Level は
 * ゲームプレイ側の決定であり、Phase 0B の範囲外である。
 */
export type SaveGameV1 = {
  readonly schemaVersion: SaveSchemaVersion
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: PlayerProgression
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  readonly finance: FinanceState
}

/** 現在の Save 型。Migration の出力型。 */
export type CurrentSave = SaveGameV1
