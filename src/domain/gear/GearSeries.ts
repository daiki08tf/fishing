import type { BrandId } from '../ids'
import type { GearCategory } from './Gear'

/**
 * Product Series（Brand → Series → Model の真ん中）。
 *
 * Series は **Content / UI 上の整理概念**である。
 * FishingEngine は Series 名も Series ID も知らない。
 * 性能差は Series ではなく各 Model（Gear）のスペックで表現する。
 *
 * 同じ Series の中でも length / power / action / 番手などで差を作る。
 */

export const GEAR_SERIES_TIERS = [
  'entry',
  'value',
  'mid',
  'upper',
  'light',
  'power',
  'shore',
  'offshore',
  'heavy',
  'flagship',
] as const
export type GearSeriesTier = (typeof GEAR_SERIES_TIERS)[number]

export const GEAR_SERIES_TIER_LABELS: Readonly<Record<GearSeriesTier, string>> = {
  entry: '入門',
  value: 'コスパ',
  mid: '中級',
  upper: '上級',
  light: 'ライト',
  power: 'パワー',
  shore: 'ショア',
  offshore: 'オフショア',
  heavy: 'ヘビー',
  flagship: 'フラッグシップ',
}

export type GearSeries = {
  readonly id: string
  readonly brandId: BrandId
  readonly name: string
  /** この Series が扱うカテゴリ。 */
  readonly category: GearCategory
  readonly tier: GearSeriesTier
  readonly description: string
}

export const gearSeriesById = (
  series: readonly GearSeries[],
  id: string | undefined,
): GearSeries | undefined =>
  id === undefined ? undefined : series.find((entry) => entry.id === id)
