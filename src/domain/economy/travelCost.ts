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
