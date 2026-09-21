import type { TransportId } from '../ids'

/**
 * 移動手段。DATA_MODEL.md §9 に対応する。
 *
 * Transport は単なるステータスではなく「アクセス可能な Spot」を変える（GAME_DESIGN.md §7）。
 */
export const TRANSPORT_TYPES = [
  'walk',
  'train',
  'bus',
  'bicycle',
  'motorcycle',
  'car',
  'suv',
  'kayak',
  'trailer_boat',
  'boat',
] as const

export type TransportType = (typeof TRANSPORT_TYPES)[number]

export type Transport = {
  readonly id: TransportId
  readonly name: string
  readonly type: TransportType

  readonly purchaseCost?: number
  readonly runningCost?: number

  readonly cargoCapacity: number
  readonly range?: number

  readonly accessTags: readonly string[]
}
