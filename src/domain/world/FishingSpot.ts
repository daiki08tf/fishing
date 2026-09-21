import type { AreaId, FishingSpotId, RegionId, RegulationId } from '../ids'
import type { Range } from '../primitives'
import type { AccessCapability, RouteFeature, TransportType } from '../access/Transport'
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
 * Phase 11 — Fishing Zone。
 *
 * Spot 内の「どこへ投げるか」を表す。遠投のためのゲーム内空間であり、
 * Zone 自体は魚種を hard gate しない。魚の存在量は FishOccurrence.zoneAffinity で変わる。
 *
 * castDistanceM が無い Zone は、船の真下など「水平キャスト距離を主軸にしない水域」を表せる。
 */
export type FishingZone = {
  readonly id: string
  readonly name: string
  readonly castDistanceM?: Range
  readonly depthRangeM?: Range
  readonly habitatTags: readonly string[]
}

/**
 * 移動手段ごとの所要時間（ゲーム内分）。
 * Phase 4 では運賃を扱わない。
 */
export type SpotTravelRoute = {
  readonly id: string
  /** この route を利用できる Transport の分類。具体的な商品 ID では分岐しない。 */
  readonly transportTypes: readonly TransportType[]
  readonly requiredCapabilities: readonly AccessCapability[]
  /** rental / launch / marina 等の利用可否。 */
  readonly features: readonly RouteFeature[]
  /** 基準所要時間。Transport の time modifier で解決する。 */
  readonly baseMinutes: number
  readonly distanceKm: number
  /** 片道の固定費。従来の `cost` と同じく往復時は 2 回分になる。 */
  readonly baseOneWayCost: number
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
  /** Phase 8: Region 内の Area（省略可）。 */
  readonly areaId?: AreaId

  readonly environment: EnvironmentType

  readonly access: readonly AccessRequirement[]

  /** 利用できる移動手段と所要時間。 */
  readonly travelOptions: readonly SpotTravelRoute[]

  /** データの信頼度。UI は provisional を「暫定」と表示する。 */
  readonly dataStatus: SpotDataStatus

  readonly habitatTags: readonly string[]

  readonly depth?: DepthProfile
  readonly current?: CurrentProfile

  /**
   * Phase 11: Spot 内の狙う水域。
   * 旧 Content との互換性のため optional。未設定時は Casting Domain が 1 つの fallback Zone を作る。
   */
  readonly fishingZones?: readonly FishingZone[]

  readonly fishTable: readonly FishOccurrence[]

  readonly regulations?: readonly RegulationRef[]

  readonly knowledgeConfig: SpotKnowledgeConfig

  readonly sourceRefs?: readonly SourceRef[]
}
