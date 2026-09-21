import type { GearId } from '../ids'
import type { Range } from '../primitives'

/**
 * タックル（Rod / Reel / Line / Leader / Hook / Lure / Bait）。
 *
 * 設計方針（Phase 6）:
 * - 装備は RPG の「Attack +10」ではない。**現実の釣具特性**から性能を説明する。
 * - ここに置くのは現実由来の属性（長さ・ルアー重量域・ドラッグ力・ライン強度など）。
 *   ゲーム調整値（係数）は `GearTuning` に分離する（DATA_MODEL §12 の分離）。
 * - 具体名は Content。Engine は装備名を知らない。
 * - 耐久性・破損・ルアーロスト・強化・クラフトは扱わない（Phase 6 の非目標）。
 */

export const GEAR_CATEGORIES = ['rod', 'reel', 'line', 'leader', 'hook', 'lure', 'bait'] as const
export type GearCategory = (typeof GEAR_CATEGORIES)[number]

export const GEAR_CATEGORY_LABELS: Readonly<Record<GearCategory, string>> = {
  rod: 'ロッド',
  reel: 'リール',
  line: 'ライン',
  leader: 'リーダー',
  hook: 'フック',
  lure: 'ルアー',
  bait: '餌',
}

/** ロッドのパワー。表示と相性の判断に使う（Engine の if 分岐には使わない）。 */
export const ROD_POWERS = ['UL', 'L', 'ML', 'M', 'MH', 'H'] as const
export type RodPower = (typeof ROD_POWERS)[number]

export const ROD_ACTIONS = ['slow', 'moderate', 'fast', 'extra_fast'] as const
export type RodAction = (typeof ROD_ACTIONS)[number]

export const REEL_TYPES = ['spinning', 'baitcasting', 'conventional', 'fly'] as const
export type ReelType = (typeof REEL_TYPES)[number]

export const LINE_TYPES = ['nylon', 'fluorocarbon', 'pe'] as const
export type LineType = (typeof LINE_TYPES)[number]

export const HOOK_TYPES = ['single', 'treble', 'circle', 'offset'] as const
export type HookType = (typeof HOOK_TYPES)[number]

export const LURE_TYPES = [
  'minnow',
  'shad',
  'crankbait',
  'vibration',
  'spinner',
  'spoon',
  'jig',
  'soft_plastic',
  'topwater',
] as const
export type LureType = (typeof LURE_TYPES)[number]

export const BAIT_TYPES = ['worm', 'paste', 'live', 'cut', 'artificial'] as const
export type BaitType = (typeof BAIT_TYPES)[number]

export type RodDefinition = {
  readonly id: GearId
  readonly category: 'rod'
  readonly name: string
  readonly price: number
  readonly lengthM: number
  readonly power: RodPower
  readonly action: RodAction
  /** 扱えるルアー重量（g）。 */
  readonly minLureWeightG: number
  readonly maxLureWeightG: number
  /** 推奨ライン強度（kg）。 */
  readonly recommendedLineMinKg: number
  readonly recommendedLineMaxKg: number
  readonly weightG: number
  /** 感度（0〜1）。 */
  readonly sensitivity: number
  /** 主導権の取りやすさ（0〜1）。 */
  readonly control: number
  /** 寄せる力（0〜1）。 */
  readonly fightingPower: number
  /** 遠投のしやすさ（0〜1）。 */
  readonly castingProfile: number
}

export type ReelLineCapacity = {
  readonly lineStrengthKg: number
  readonly capacityM: number
}

export type ReelDefinition = {
  readonly id: GearId
  readonly category: 'reel'
  readonly name: string
  readonly price: number
  readonly reelType: ReelType
  readonly size: number
  readonly gearRatio: number
  readonly maxDragKg: number
  readonly lineCapacity: readonly ReelLineCapacity[]
  readonly retrieveCmPerTurn: number
  readonly weightG: number
  /** 巻き取りの滑らかさ（0〜1）。 */
  readonly smoothness: number
  /** 操作のしやすさ（0〜1）。 */
  readonly control: number
}

export type LineDefinition = {
  readonly id: GearId
  readonly category: 'line'
  readonly name: string
  readonly price: number
  readonly lineType: LineType
  readonly strengthKg: number
  readonly diameterMm: number
  /** 伸び（0〜1、大きいほど伸びる）。 */
  readonly stretch: number
  /** 耐摩耗性（0〜1）。 */
  readonly abrasionResistance: number
  /** 視認されにくさ（0〜1、大きいほど目立たない）。 */
  readonly visibility: number
  /** 感度（0〜1）。 */
  readonly sensitivity: number
}

export type LeaderDefinition = {
  readonly id: GearId
  readonly category: 'leader'
  readonly name: string
  readonly price: number
  readonly material: string
  readonly strengthKg: number
  readonly diameterMm: number
  readonly abrasionResistance: number
  readonly visibility: number
  readonly lengthM: number
}

export type HookDefinition = {
  readonly id: GearId
  readonly category: 'hook'
  readonly name: string
  readonly price: number
  readonly size: number
  readonly strengthKg: number
  readonly hookType: HookType
  /** 掛かりやすさ（0〜1）。 */
  readonly penetration: number
  /** 外れにくさ（0〜1）。 */
  readonly holdingPower: number
}

export type LureDefinition = {
  readonly id: GearId
  readonly category: 'lure'
  readonly name: string
  readonly price: number
  readonly lureType: LureType
  readonly weightG: number
  readonly lengthMm: number
  /** 泳層（m）。 */
  readonly depthRangeM: Range
  readonly retrieveStyle: string
  readonly action: string
  /** 色・見え方の分類（open string）。 */
  readonly visualProfile: string
  /** 相性を示すタグ（魚種の offeringAffinity と突き合わせる）。 */
  readonly targetProfile: readonly string[]
}

export type BaitDefinition = {
  readonly id: GearId
  readonly category: 'bait'
  readonly name: string
  readonly price: number
  readonly baitType: BaitType
  readonly presentation: string
  readonly targetProfile: readonly string[]
}

export type GearItem =
  | RodDefinition
  | ReelDefinition
  | LineDefinition
  | LeaderDefinition
  | HookDefinition
  | LureDefinition
  | BaitDefinition

/** offering = 実際に魚へ見せるもの（ルアーまたは餌）。 */
export type OfferingDefinition = LureDefinition | BaitDefinition

export const isRod = (gear: GearItem): gear is RodDefinition => gear.category === 'rod'
export const isReel = (gear: GearItem): gear is ReelDefinition => gear.category === 'reel'
export const isLine = (gear: GearItem): gear is LineDefinition => gear.category === 'line'
export const isLeader = (gear: GearItem): gear is LeaderDefinition => gear.category === 'leader'
export const isHook = (gear: GearItem): gear is HookDefinition => gear.category === 'hook'
export const isOffering = (gear: GearItem): gear is OfferingDefinition =>
  gear.category === 'lure' || gear.category === 'bait'

export const gearById = (items: readonly GearItem[], id: GearId): GearItem | undefined =>
  items.find((item) => item.id === id)

/**
 * 相性タグ。offering の targetProfile と魚種の offeringAffinity を突き合わせる。
 * 「特定のルアーでないと釣れない」ためではなく、相性の良し悪しに使う。
 */
export const offeringTagsOf = (offering: OfferingDefinition): readonly string[] => [
  offering.category === 'lure' ? offering.lureType : offering.baitType,
  ...offering.targetProfile,
]
