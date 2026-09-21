import type { GearId } from '../ids'
import type { Range } from '../primitives'

/**
 * PROVISIONAL — DATA_MODEL.md §13 は Rod / Reel / Line / Lure の
 * フィールド名を列挙するのみで、型定義と単位を与えていない。
 *
 * Phase 0B では、その列挙をそのまま型へ写す。
 * 実在製品を使うか架空ブランドを使うかは Content 側の属性であり、
 * ここには持ち込まない（DECISIONS.md §1）。
 *
 * 単位はフィールド名に含める。実在ブランド投入時に再検討する。
 */

export const GEAR_KINDS = ['rod', 'reel', 'line', 'lure'] as const
export type GearKind = (typeof GEAR_KINDS)[number]

export type RodSpec = {
  readonly lengthCm: number
  /** 表記ゆれを避けるため open string（列挙は実コンテンツ投入時に確定）。 */
  readonly power: string
  readonly action: string
  /** ルアー重量域（g）。 */
  readonly lureWeightRange: Range
  /** 適合ライン強度（lb）。 */
  readonly lineRating: Range
  readonly weightG: number
  /** 感度。0〜1 の相対値。 */
  readonly sensitivity: number
}

export type ReelLineCapacity = {
  readonly lineStrengthLb: number
  readonly capacityM: number
}

export type ReelSpec = {
  readonly size: string
  readonly gearRatio: number
  readonly dragKg: number
  readonly weightG: number
  readonly lineCapacity: readonly ReelLineCapacity[]
  /** 1回転あたりの巻き取り量（cm）。 */
  readonly retrieveRateCmPerTurn: number
}

export type LineSpec = {
  readonly material: string
  readonly diameterMm: number
  readonly strengthLb: number
  readonly stretch: number
}

export const LURE_BUOYANCIES = ['floating', 'suspending', 'slow_sinking', 'sinking'] as const
export type LureBuoyancy = (typeof LURE_BUOYANCIES)[number]

export type LureSpec = {
  readonly category: string
  readonly lengthMm: number
  readonly weightG: number
  /** 想定レンジ（m）。 */
  readonly depthRange: Range
  readonly action: string
  readonly buoyancy: LureBuoyancy
  readonly targetProfile: readonly string[]
}

export type GearItem =
  | { readonly id: GearId; readonly kind: 'rod'; readonly name: string; readonly spec: RodSpec }
  | { readonly id: GearId; readonly kind: 'reel'; readonly name: string; readonly spec: ReelSpec }
  | { readonly id: GearId; readonly kind: 'line'; readonly name: string; readonly spec: LineSpec }
  | { readonly id: GearId; readonly kind: 'lure'; readonly name: string; readonly spec: LureSpec }
