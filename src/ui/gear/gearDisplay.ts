import type { BrandDefinition } from '../../domain/gear/Brand'
import { formatHookSize, GEAR_CATEGORY_LABELS, type GearItem } from '../../domain/gear/Gear'
import type { GearSeries } from '../../domain/gear/GearSeries'

/**
 * 装備の表示（Brand → Series → Model と主要スペック）。
 *
 * ここは**表示だけ**を行う。性能の解釈（互換性・modifier）は Domain の仕事であり、
 * UI でルールを再実装しない。
 */

export type GearFamily = {
  readonly brand: string
  readonly series: string
  /** 例: `Shimara STRADIA` */
  readonly label: string
}

export const gearFamilyOf = (
  gear: GearItem,
  brands: readonly BrandDefinition[],
  series: readonly GearSeries[],
): GearFamily => {
  const brand =
    gear.brandId === undefined
      ? ''
      : (brands.find((entry) => entry.id === gear.brandId)?.name ?? '')
  const seriesName =
    (gear.seriesId === undefined
      ? undefined
      : series.find((entry) => entry.id === gear.seriesId)?.name) ??
    gear.series ??
    ''

  return {
    brand,
    series: seriesName,
    label: [brand, seriesName].filter((part) => part.length > 0).join(' '),
  }
}

/** 見出しに使う名前。ブランドと Series があれば添える。 */
export const gearTitleOf = (
  gear: GearItem,
  brands: readonly BrandDefinition[],
  series: readonly GearSeries[],
): string => {
  const family = gearFamilyOf(gear, brands, series)
  return family.label.length === 0 ? gear.name : `${gear.name}（${family.label}）`
}

/** 主要スペック（1〜2 行）。 */
export const gearSpecsOf = (gear: GearItem): readonly string[] => {
  switch (gear.category) {
    case 'rod':
      return [
        `${String(gear.lengthM)}m / ${gear.power} / ${gear.action} / ${String(
          gear.minLureWeightG,
        )}–${String(gear.maxLureWeightG)}g`,
        `推奨ライン ${String(gear.recommendedLineMinKg)}–${String(
          gear.recommendedLineMaxKg,
        )}kg / 自重 ${String(gear.weightG)}g / 感度 ${gear.sensitivity.toFixed(2)}`,
      ]
    case 'reel':
      return [
        `${String(gear.sizeClass ?? gear.size)}番 ${gear.variant ?? 'STD'} / ドラッグ ${String(
          gear.maxDragKg,
        )}kg / ギア比 ${String(gear.gearRatio)}`,
        `巻取 ${String(gear.retrieveCmPerTurn)}cm / 自重 ${String(
          gear.weightG,
        )}g / 滑らかさ ${gear.smoothness.toFixed(2)}${
          gear.dragStartup === undefined ? '' : ` / ドラグ初動 ${gear.dragStartup.toFixed(2)}`
        }`,
      ]
    case 'line':
      return [
        `${gear.lineType} / ${String(gear.strengthKg)}kg / ${String(gear.diameterMm)}mm`,
        `伸び ${gear.stretch.toFixed(2)} / 耐摩耗 ${gear.abrasionResistance.toFixed(
          2,
        )} / 視認 ${gear.visibility.toFixed(2)} / 感度 ${gear.sensitivity.toFixed(2)}`,
      ]
    case 'leader':
      return [
        `${gear.material} / ${String(gear.strengthKg)}kg / ${String(gear.diameterMm)}mm / ${String(
          gear.lengthM,
        )}m`,
        `耐摩耗 ${gear.abrasionResistance.toFixed(2)} / 視認 ${gear.visibility.toFixed(2)}`,
      ]
    case 'hook':
      return [
        `${formatHookSize(gear.size)} / ${gear.hookType} / ${String(gear.strengthKg)}kg`,
        `掛かり ${gear.penetration.toFixed(2)} / 保持 ${gear.holdingPower.toFixed(2)}${
          gear.gaugeMm === undefined ? '' : ` / 線径 ${String(gear.gaugeMm)}mm`
        }`,
      ]
    case 'lure':
      return [
        `${gear.lureType} / ${String(gear.weightG)}g / ${String(gear.lengthMm)}mm`,
        `泳層 ${String(gear.depthRangeM.min)}–${String(gear.depthRangeM.max)}m / ${
          gear.retrieveStyle
        } / ${gear.visualProfile}`,
      ]
    case 'bait':
      return [`${gear.baitType} / ${gear.presentation}`]
    case 'electronics':
      return [
        `${gear.kind} / 探知 ${String(gear.detectionDepthM)}m`,
        `精度 ${gear.accuracy.toFixed(2)} / 自重 ${String(gear.weightG)}g`,
      ]
  }
}

export const gearCategoryLabel = (gear: GearItem): string => GEAR_CATEGORY_LABELS[gear.category]
