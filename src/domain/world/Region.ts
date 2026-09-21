import type { AreaId, CountryId, RegionId } from '../ids'

/** 地域階層の種別。DATA_MODEL.md §5 に対応する。 */
export const REGION_TYPES = ['country', 'prefecture', 'area', 'water_system', 'water_body'] as const

export type RegionType = (typeof REGION_TYPES)[number]

/**
 * 地域。DATA_MODEL.md §5 に対応する。
 *
 * 地域 > 水域 > エリア > Spot の階層を parentId で表現する（GAME_DESIGN.md §4.1）。
 */
export type Region = {
  readonly id: RegionId
  readonly name: string
  readonly parentId?: RegionId
  readonly type: RegionType
}

/**
 * Phase 8: 世界階層。World → Country → Region → Area → FishingSpot。
 *
 * 巨大な WorldManager は作らない。Content（countries / regions）と Spot の
 * `regionId` / `areaId` だけで階層を表現する。
 */

/** データの信頼度。Spot の `dataStatus` と同じ語彙を使う。 */
export const WORLD_DATA_STATUSES = ['provisional', 'verified'] as const
export type WorldDataStatus = (typeof WORLD_DATA_STATUSES)[number]

/**
 * 遠征先として遊べるか。
 * - `playable`: Expedition と Spot があり、遠征できる
 * - `planned`: 地域定義だけ（将来の拡張用。Spot / Expedition を持たない）
 */
export const REGION_STAGES = ['playable', 'planned'] as const
export type RegionStage = (typeof REGION_STAGES)[number]

export type Country = {
  readonly id: CountryId
  readonly name: string
  /** 日本国内か。国内 / 海外で同じ仕組みを使うための表示用の区別。 */
  readonly domestic: boolean
  /** 表示用の通貨 metadata（換算はしない）。 */
  readonly currency?: {
    readonly code: string
    readonly symbol: string
  }
  readonly dataStatus: WorldDataStatus
}

/** Region 内のエリア（Spot が所属する）。 */
export type RegionArea = {
  readonly id: AreaId
  readonly name: string
}

/**
 * 遠征中の拠点（HOME 相当）。
 * 国内の自宅も、海外の現地ベースも同じ表現にする。
 */
export type RegionBase = {
  readonly id: string
  readonly name: string
  readonly areaId: AreaId
}

export type RegionDefinition = {
  readonly id: RegionId
  readonly countryId: CountryId
  readonly name: string
  readonly stage: RegionStage
  readonly dataStatus: WorldDataStatus
  /** この地域にいるときの拠点。 */
  readonly base: RegionBase
  readonly areas: readonly RegionArea[]
}
