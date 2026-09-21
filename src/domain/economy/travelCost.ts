import type { SpotTravelOption } from '../world/FishingSpot'
import type { FinanceState } from './FinanceState'
import { canAfford, formatYen } from './finance'

/**
 * 交通費。Phase 5 では「往復いくらか」だけを見る。
 *
 * 細かすぎて面倒にならないことを優先し、運賃は Spot の移動手段ごとに
 * 固定値（`SpotTravelOption.cost`）として Content に持たせる。
 */

export const roundTripCostFor = (option: SpotTravelOption): number =>
  Math.max(0, Math.round(option.cost)) * 2

export const canAffordTrip = (finance: FinanceState, option: SpotTravelOption): boolean =>
  canAfford(finance, roundTripCostFor(option))

export const describeTravelCost = (option: SpotTravelOption): string =>
  roundTripCostFor(option) === 0 ? '交通費なし' : `${formatYen(roundTripCostFor(option))}（往復）`
