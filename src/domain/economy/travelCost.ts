import type { ResolvedTravelOption } from '../access/Transport'
import type { FinanceState } from './FinanceState'
import { canAfford, formatYen } from './finance'

/**
 * 交通費。Phase 7A でも既存の「片道費 × 2」を維持する。
 *
 * route の片道費へ、Transport の走行費を加え、レンタル料だけは 1 釣行に 1 回加える。
 * toll / parking / ferry / lodging は cost component を拡張して扱う。
 */

export const roundTripCostFor = (option: ResolvedTravelOption): number =>
  Math.max(0, Math.round(option.oneWayCost)) * 2 + Math.max(0, Math.round(option.perTripCost))

export const canAffordTrip = (finance: FinanceState, option: ResolvedTravelOption): boolean =>
  canAfford(finance, roundTripCostFor(option))

export const describeTravelCost = (option: ResolvedTravelOption): string =>
  roundTripCostFor(option) === 0 ? '交通費なし' : `${formatYen(roundTripCostFor(option))}（往復）`

/**
 * Trip UI の初期選択。往復費が最も安い option（同額なら速い順）を選ぶ。
 *
 * 「4 分速いだけの高額な候補を黙って選び、高い往復費を課す」ことを避けるための規則である。
 * 払えるかどうかは Economy の `canAffordTrip`（Store の `evaluateTrip`）で別に判定する。
 */
export const defaultTravelOption = (
  options: readonly ResolvedTravelOption[],
): ResolvedTravelOption | null => {
  let cheapest: ResolvedTravelOption | null = null

  for (const option of options) {
    if (cheapest === null) {
      cheapest = option
      continue
    }

    const cost = roundTripCostFor(option)
    const cheapestCost = roundTripCostFor(cheapest)

    if (cost < cheapestCost || (cost === cheapestCost && option.minutes < cheapest.minutes)) {
      cheapest = option
    }
  }

  return cheapest
}

/**
 * 費用の内訳を UI 表示用の短い行にする。
 * `charge` は Economy の規則（片道は往復で 2 回、1 釣行費は 1 回）をそのまま示す。
 */
export const describeTravelCostParts = (option: ResolvedTravelOption): readonly string[] =>
  option.costComponents.map(
    (component) =>
      `${component.label} ${formatYen(component.amount)}（${
        component.charge === 'per_trip' ? '1釣行' : '片道'
      }）`,
  )
