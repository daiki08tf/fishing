import type { RegionId } from '../ids'

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
