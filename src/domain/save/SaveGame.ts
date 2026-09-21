import type { CareerState } from '../career/CareerState'
import type { CodexState } from '../codex/FishRecord'
import type { FinanceState } from '../economy/FinanceState'
import type { KnowledgeState } from '../knowledge/KnowledgeState'
import type { IsoDateTime } from '../primitives'
import type { PlayerProgression } from '../progression/PlayerProgression'
import type { AnglerProgression } from '../progression/AnglerProgression'

/**
 * Save schema。ARCHITECTURE.md §9 に対応する。
 *
 * 破壊的変更時は必ず version を上げ、Migration を用意する。
 *
 * v1: 技術基盤（Phase 0B）。成長は DATA_MODEL.md §11 の PlayerProgression のみ。
 * v2: Angler Progression（Phase 3）。Level / XP / Skill Point / Skill / Perk /
 *     反復状態に加え、Codex（捕獲記録）を保存する。
 */

export const SAVE_SCHEMA_VERSION_V1 = 1 as const
export const SAVE_SCHEMA_VERSION_V2 = 2 as const

export const CURRENT_SAVE_SCHEMA_VERSION = SAVE_SCHEMA_VERSION_V2

export type SaveSchemaVersion = typeof CURRENT_SAVE_SCHEMA_VERSION

export type SaveGameV1 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V1
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: PlayerProgression
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  readonly finance: FinanceState
}

/**
 * 現行の Save。
 *
 * v2 は Phase 3 で「成長」と「Codex」を保存対象にした。
 * Codex を保存しないと、再起動のたびに初捕獲ボーナスと自己記録ボーナスが
 * 再取得できてしまう（＝ XP の抜け道になる）ため、Progression と同じ Save に入れる。
 *
 * `player` / `inventory` / `world` は設計文書で型が未定義のため含めない。
 */
export type SaveGameV2 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V2
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  readonly finance: FinanceState
}

export type CurrentSave = SaveGameV2
