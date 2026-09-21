import type { FishingSpotId, RegionId, RegulationId } from '../ids'
import type { TransportType } from '../access/Transport'
import type { SourceRef } from '../source/SourceRef'
import type { CurrentProfile, DepthProfile } from '../fish/profiles'
import type { AccessRequirement } from '../access/AccessRequirement'
import type { FishOccurrence } from './FishOccurrence'

/**
 * フィールドの最小単位。DATA_MODEL.md §6 に対応する。
 *
 * 数百〜1000以上の Spot 追加に耐える構造にする（GAME_DESIGN.md §4.2）。
 */

/**
 * PROVISIONAL — 設計文書は EnvironmentType の列挙を定義していない。
 * Phase 0B では open string とし、最初の実エリア（Phase 4）で確定する。
 */
export type EnvironmentType = string

/** 出典の参照。DATA_MODEL.md §6 の regulations フィールドに対応する。 */
export type RegulationRef = RegulationId

/**
 * PROVISIONAL — Spot Knowledge の開示設定。
 *
 * GAME_DESIGN.md §10 / PROGRESSION.md §11 は「Knowledgeが増えると見える情報」を
 * 列挙しているが、構造は未定義。最小表現として
 * 「どの項目が、どの Knowledge 値から見えるか」だけを保持する。
 */
export type SpotKnowledgeReveal = {
  readonly field: string
  readonly minKnowledge: number
}

export type SpotKnowledgeConfig = {
  readonly reveals: readonly SpotKnowledgeReveal[]
}

/**
 * 移動手段ごとの所要時間（ゲーム内分）。
 * Phase 4 では運賃を扱わない。
 */
export type SpotTravelOption = {
  readonly transport: TransportType
  /** 片道の所要時間（ゲーム内の分）。 */
  readonly minutes: number
  /** 片道の運賃（円）。徒歩は 0。 */
  readonly cost: number
}

/**
 * その Spot のデータがどの程度信頼できるか。
 *
 * 実在の釣り場について、魚種・規制・立入可否を根拠なく断定しないための表示。
 * - `provisional`: 検証用・概略。UI にもその旨を出す
 * - `verified`: 出典（sourceRefs）に基づく
 *
 * Phase 4 のコンテンツはすべて `provisional` である。
 */
export const SPOT_DATA_STATUSES = ['provisional', 'verified'] as const
export type SpotDataStatus = (typeof SPOT_DATA_STATUSES)[number]

export type FishingSpot = {
  readonly id: FishingSpotId
  readonly name: string
  readonly regionId: RegionId

  readonly environment: EnvironmentType

  readonly access: readonly AccessRequirement[]

  /** 利用できる移動手段と所要時間。 */
  readonly travelOptions: readonly SpotTravelOption[]

  /** データの信頼度。UI は provisional を「暫定」と表示する。 */
  readonly dataStatus: SpotDataStatus

  readonly habitatTags: readonly string[]

  readonly depth?: DepthProfile
  readonly current?: CurrentProfile

  readonly fishTable: readonly FishOccurrence[]

  readonly regulations?: readonly RegulationRef[]

  readonly knowledgeConfig: SpotKnowledgeConfig

  readonly sourceRefs?: readonly SourceRef[]
}
