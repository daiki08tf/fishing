import type { CareerState } from '../career/CareerState'
import type { CodexState } from '../codex/FishRecord'
import type { FinanceState } from '../economy/FinanceState'
import type { KnowledgeState } from '../knowledge/KnowledgeState'
import type { IsoDateTime } from '../primitives'
import type { PlayerProgression } from '../progression/PlayerProgression'
import type { AnglerProgression } from '../progression/AnglerProgression'
import type { Inventory } from '../tackle/Inventory'
import type { Loadout } from '../tackle/Loadout'
import type { PlayerTransportState } from '../access/Transport'
import type { ExpeditionState } from '../expedition/Expedition'
import type { TradeState } from '../trade/TradeState'
import type { FishingSpotId, ShopItemId } from '../ids'
import type { WorldTime } from '../world/WorldTime'
import type { WorldPhase, WorldState } from '../world/worldSession'

/**
 * Save schema。ARCHITECTURE.md §9 に対応する。
 *
 * 破壊的変更時は必ず version を上げ、Migration を用意する。
 *
 * v1: 技術基盤（Phase 0B）。成長は DATA_MODEL.md §11 の PlayerProgression のみ。
 * v2: Angler Progression（Phase 3）。Level / XP / Skill Point / Skill / Perk /
 *     反復状態に加え、Codex（捕獲記録）を保存する。
 * v3: World（Phase 4）。ゲーム内時間・現在位置・発見済み Spot・移動手段・釣行記録を保存する。
 * v4: Economy（Phase 5）。資金の詳細（月次精算・履歴）と購入済み商品を保存する。
 * v5: Tackle（Phase 6）。所持している Gear（inventory）と現在の装備（loadout）を保存する。
 * v6: Transport（Phase 7A）。所有・利用可能 Transport を World から独立して保存する。
 * v7: Expedition（Phase 8）。World に地域（currentRegionId）を足し、
 *     遠征（current / 訪問済み地域 / 許可）を独立ブロックで保存する。
 * v8: Phase 12。魚種 ID を地域依存から世界共通の canonical ID へ移行する。
 *     保存構造自体は v7 と同じで、Codex / Knowledge / repetition のキーだけを正規化する。
 * v9: Phase 13。Fish Box（持ち帰った魚）と Trade / Contact（Trust・claim 済み報酬・
 *     既知の噂）を独立ブロック（trade）として追加する。既存ブロックは変更しない。
 */

export const SAVE_SCHEMA_VERSION_V1 = 1 as const
export const SAVE_SCHEMA_VERSION_V2 = 2 as const
export const SAVE_SCHEMA_VERSION_V3 = 3 as const
export const SAVE_SCHEMA_VERSION_V4 = 4 as const
export const SAVE_SCHEMA_VERSION_V5 = 5 as const
export const SAVE_SCHEMA_VERSION_V6 = 6 as const
export const SAVE_SCHEMA_VERSION_V7 = 7 as const
export const SAVE_SCHEMA_VERSION_V8 = 8 as const
export const SAVE_SCHEMA_VERSION_V9 = 9 as const

export const CURRENT_SAVE_SCHEMA_VERSION = SAVE_SCHEMA_VERSION_V9

export type SaveSchemaVersion = typeof CURRENT_SAVE_SCHEMA_VERSION

export type SaveGameV1 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V1
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: PlayerProgression
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  /** v3 時点の資金ブロック（月次精算の状態と履歴は v4 で追加）。 */
  readonly finance: FinanceStateV3
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
  readonly finance: FinanceStateV3
}

/**
 * 現行の Save（Phase 4）。
 *
 * world は Domain の WorldState をそのまま保存する（Save 層で別の World ルールを作らない）。
 * Spot ごとの Knowledge は knowledge.spots、地域の Knowledge は knowledge.regions に入る。
 */
/** v3〜v5 に保存されていた旧 Transport enum。v6 migration の入力専用。 */
export type LegacyTransportType =
  | 'walk'
  | 'train'
  | 'bus'
  | 'bicycle'
  | 'motorcycle'
  | 'car'
  | 'suv'
  | 'kayak'
  | 'trailer_boat'
  | 'boat'

export type LegacyTripSummary = {
  readonly spotId: FishingSpotId
  readonly spotName: string
  readonly startedAt: WorldTime
  readonly arrivedAt: WorldTime
  readonly attempts: number
  readonly catches: number
  readonly xpGained: number
  readonly knowledgeGained: number
  readonly largestLengthCm: number | null
}

/** Phase 7A より前の World。Transport ownership が World に混在していた。 */
export type LegacyWorldState = {
  readonly time: WorldTime
  readonly phase: WorldPhase
  readonly homeLocationId: string
  readonly currentSpotId: FishingSpotId | null
  readonly arrivalTime: WorldTime | null
  readonly trip: LegacyTripSummary | null
  readonly discoveredSpotIds: readonly FishingSpotId[]
  readonly availableTransports: readonly LegacyTransportType[]
}

export type SaveGameV3 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V3
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: LegacyWorldState
  readonly knowledge: KnowledgeState
  readonly career: CareerState
  readonly finance: FinanceStateV3
}

/**
 * v3 時点の資金ブロック。
 * Phase 5 で月次精算と履歴が増えたため、移行のために残す。
 */
export type FinanceStateV3 = {
  readonly cash: number
  readonly salaryIncome: number
  readonly simplifiedLivingCost: number
}

/**
 * 現行の Save（Phase 5）。
 *
 * finance は月次精算の状態と履歴を含み、purchases は購入済み商品を持つ。
 * world / progression / codex / knowledge は v3 と同じ。
 *
 * Career / 仕事の予定（勤務時間・有給）はゲームシステムではないため保存しない。
 * 会社員設定は月次の定期収入（finance）としてのみ表現する。
 */
export type SaveGameV4 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V4
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: LegacyWorldState
  readonly knowledge: KnowledgeState
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
}

/**
 * 現行の Save（Phase 6）。
 *
 * inventory は「所持している Gear」、loadout は「今使っているタックル」である。
 * どちらも Domain の型をそのまま保存する（Save 層で別のルールを作らない）。
 * 性能・互換性の解決は保存しない（Content が変われば再解決する）。
 *
 * v4 と同じく、Career / 仕事の予定はゲームシステムではないため保存しない。
 */
export type SaveGameV5 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V5
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: LegacyWorldState
  readonly knowledge: KnowledgeState
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
  readonly inventory: Inventory
  readonly loadout: Loadout
}

/**
 * v6 の World。Phase 8 で `currentRegionId` が増えたため、migration 入力として残す。
 */
export type LegacyWorldStateV6 = Omit<WorldState, 'currentRegionId'>

/** Phase 7A の Save。Transport ownership は World と別の Domain state。 */
export type SaveGameV6 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V6
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: LegacyWorldStateV6
  readonly transport: PlayerTransportState
  readonly knowledge: KnowledgeState
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
  readonly inventory: Inventory
  readonly loadout: Loadout
}

/**
 * 現行の Save（Phase 8）。
 *
 * World が地域（currentRegionId）を持ち、遠征（ExpeditionState）が独立ブロックになる。
 * 遠征中の拠点・訪問済み地域・所持している許可をここで保持する。
 */
export type SaveGameV7 = {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V7
  readonly createdAt: IsoDateTime
  readonly updatedAt: IsoDateTime
  readonly progression: AnglerProgression
  readonly codex: CodexState
  readonly world: WorldState
  readonly transport: PlayerTransportState
  readonly expedition: ExpeditionState
  readonly knowledge: KnowledgeState
  readonly finance: FinanceState
  readonly purchases: readonly ShopItemId[]
  readonly inventory: Inventory
  readonly loadout: Loadout
}

/**
 * Phase 12 の現行 Save。
 *
 * v8 は「魚種 ID の canonical 化」を migration 境界で確定させるための version。
 * フィールド追加は無く、v7 と同じブロック構造を維持する。
 */
export type SaveGameV8 = Omit<SaveGameV7, 'schemaVersion'> & {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V8
}

/**
 * 現行の Save（Phase 13）。
 *
 * trade は Fish Box（持ち帰った魚）と Trade / Contact（Trust・claim 済み報酬・
 * 既知の噂）をまとめた独立ブロック。Hidden Spot の discovered 判定は
 * 既存の `world.discoveredSpotIds` をそのまま使うため、ここには持たない。
 */
export type SaveGameV9 = Omit<SaveGameV8, 'schemaVersion'> & {
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION_V9
  readonly trade: TradeState
}

export type CurrentSave = SaveGameV9
