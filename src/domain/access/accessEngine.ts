import type { KnowledgeState } from '../knowledge/KnowledgeState'
import { regionKnowledgeScore } from '../knowledge/regionKnowledge'
import { spotKnowledgeScore } from '../knowledge/spotKnowledge'
import type { FishingSpot, SpotTravelRoute } from '../world/FishingSpot'
import type { DayOfWeek } from '../world/WorldTime'
import type { AccessRequirementKind } from './AccessRequirement'
import type {
  AccessCapability,
  PlayerTransportState,
  ResolvedTravelOption,
  TransportDefinition,
  TravelCostComponent,
} from './Transport'

/**
 * Spot へ物理的に行けるかを解決する。
 *
 * AccessEngine は Content の具体的な車種・船名を知らない。TransportDefinition が持つ
 * capability / ownership model / route requirement だけを比較する。費用を解決して返すが、
 * 所持金による可否は Economy の責務であり、ここでは判定しない。
 */

export type AccessBlockedReason = {
  readonly kind: AccessRequirementKind
  readonly label: string
  readonly required?: number
  readonly current?: number
  readonly capability?: AccessCapability
}

export type AccessEvaluation = {
  readonly spotId: string
  readonly accessible: boolean
  readonly travelOptions: readonly ResolvedTravelOption[]
  readonly blockedReasons: readonly AccessBlockedReason[]
  readonly satisfiedKinds: readonly AccessRequirementKind[]
}

export type AccessEvaluationInput = {
  readonly spot: FishingSpot
  readonly transports: readonly TransportDefinition[]
  readonly playerTransports: PlayerTransportState
  readonly knowledge: KnowledgeState
  readonly reputation?: number
  readonly permits?: readonly string[]
  readonly dayOfWeek?: DayOfWeek
  readonly month?: number
  readonly reputationEnabled?: boolean
  readonly permitsEnabled?: boolean
}

const CAPABILITY_LABELS: Readonly<Record<AccessCapability, string>> = {
  reachable_on_foot: '徒歩で到達できる経路',
  public_transport: '公共交通でのアクセス',
  bicycle_access: '自転車でのアクセス',
  road_access: '道路からのアクセス',
  rough_road: '未舗装・荒路への対応',
  kayak_launch: 'カヤックを出せるアクセス',
  boat_required: '船でのアクセス',
  offshore: '沖への航行能力',
  island_access: '島への渡航能力',
}

const includesAll = <T>(available: readonly T[], required: readonly T[]): boolean =>
  required.every((entry) => available.includes(entry))

const transportCanBeUsed = (
  definition: TransportDefinition,
  state: PlayerTransportState,
  route: SpotTravelRoute,
): boolean => {
  if (!route.transportTypes.includes(definition.transportType)) {
    return false
  }

  if (!includesAll(route.features, definition.requiredRouteFeatures)) {
    return false
  }

  if (definition.maxRangeKm !== undefined && route.distanceKm > definition.maxRangeKm) {
    return false
  }

  switch (definition.ownershipModel) {
    case 'always_available':
      return state.availableTransportIds.includes(definition.id)
    case 'owned':
      return (
        state.availableTransportIds.includes(definition.id) &&
        state.ownedTransportIds.includes(definition.id)
      )
    case 'rental':
      // Rental availability is explicit in player/trip planning state. The route must
      // also list the rental type and all required facilities (rental desk / marina).
      // This keeps "a rental exists somewhere" from making every matching route usable.
      return state.availableTransportIds.includes(definition.id)
  }
}

const runningCostFor = (definition: TransportDefinition, route: SpotTravelRoute): number => {
  switch (definition.travelCostModel.kind) {
    case 'free':
    case 'route_fare':
      return 0
    case 'per_km':
      return Math.max(
        definition.travelCostModel.minimumOneWayCost,
        Math.round(route.distanceKm * definition.travelCostModel.yenPerKm),
      )
  }
}

const resolveOption = (
  definition: TransportDefinition,
  route: SpotTravelRoute,
): ResolvedTravelOption => {
  const components: TravelCostComponent[] = []

  if (route.baseOneWayCost > 0) {
    components.push({
      kind: definition.travelCostModel.kind === 'route_fare' ? 'fare' : 'other',
      label: definition.travelCostModel.kind === 'route_fare' ? '運賃' : '経路費用',
      amount: route.baseOneWayCost,
      charge: 'one_way',
    })
  }

  const runningCost = runningCostFor(definition, route)
  if (runningCost > 0) {
    components.push({
      kind: 'running_cost',
      label: '走行費',
      amount: runningCost,
      charge: 'one_way',
    })
  }

  const rentalCost = definition.ownershipModel === 'rental' ? (definition.rentalCost ?? 0) : 0
  if (rentalCost > 0) {
    components.push({
      kind: 'rental',
      label: 'レンタル料',
      amount: rentalCost,
      charge: 'per_trip',
    })
  }

  return {
    routeId: route.id,
    transportId: definition.id,
    transportType: definition.transportType,
    transportName: definition.name,
    minutes: Math.max(1, Math.round(route.baseMinutes * definition.travelTimeModifier)),
    distanceKm: route.distanceKm,
    oneWayCost: route.baseOneWayCost + runningCost,
    perTripCost: rentalCost,
    costComponents: components,
    cargo: definition.cargo,
    capabilities: definition.capabilities,
  }
}

const capabilityRequirements = (spot: FishingSpot): readonly AccessCapability[] =>
  spot.access.flatMap((requirement) =>
    requirement.kind === 'capability' ? [requirement.capability] : [],
  )

const resolveTravelOptions = (input: AccessEvaluationInput): readonly ResolvedTravelOption[] => {
  const requiredBySpot = capabilityRequirements(input.spot)
  const resolved: ResolvedTravelOption[] = []

  for (const route of input.spot.travelOptions) {
    for (const definition of input.transports) {
      if (!transportCanBeUsed(definition, input.playerTransports, route)) {
        continue
      }

      if (!includesAll(definition.capabilities, route.requiredCapabilities)) {
        continue
      }

      // A single travel option must satisfy the physical requirements. Capabilities from
      // unrelated vehicles are never combined into an impossible journey.
      if (!includesAll(definition.capabilities, requiredBySpot)) {
        continue
      }

      resolved.push(resolveOption(definition, route))
    }
  }

  return resolved.sort(
    (left, right) =>
      left.minutes - right.minutes ||
      String(left.transportId).localeCompare(String(right.transportId)),
  )
}

export const evaluateAccess = (input: AccessEvaluationInput): AccessEvaluation => {
  const { spot } = input
  const knowledgeScore = spotKnowledgeScore(input.knowledge, String(spot.id))
  const regionScore = regionKnowledgeScore(input.knowledge, String(spot.regionId))
  const reputation = input.reputation ?? 0
  const permits = input.permits ?? []
  const blockedReasons: AccessBlockedReason[] = []
  const satisfiedKinds: AccessRequirementKind[] = []
  const travelOptions = resolveTravelOptions(input)

  for (const requirement of spot.access) {
    switch (requirement.kind) {
      case 'capability': {
        if (travelOptions.some((option) => option.capabilities.includes(requirement.capability))) {
          satisfiedKinds.push('capability')
        } else {
          blockedReasons.push({
            kind: 'capability',
            capability: requirement.capability,
            label: `必要: ${CAPABILITY_LABELS[requirement.capability]}`,
          })
        }
        break
      }

      case 'knowledge': {
        const scoped = requirement.scope === 'region' ? regionScore : knowledgeScore

        if (scoped >= requirement.minimum) {
          satisfiedKinds.push('knowledge')
        } else {
          blockedReasons.push({
            kind: 'knowledge',
            label:
              requirement.scope === 'region'
                ? `必要: この水域の知識 ${String(requirement.minimum)}%`
                : `必要: この釣り場の知識 ${String(requirement.minimum)}%`,
            required: requirement.minimum,
            current: Math.round(scoped),
          })
        }
        break
      }

      case 'reputation': {
        if (!input.reputationEnabled || reputation >= requirement.minimum) {
          satisfiedKinds.push('reputation')
        } else {
          blockedReasons.push({
            kind: 'reputation',
            label: `必要: 名声 ${String(requirement.minimum)}`,
            required: requirement.minimum,
            current: reputation,
          })
        }
        break
      }

      case 'permit': {
        if (input.permitsEnabled && permits.includes(String(requirement.permitId))) {
          satisfiedKinds.push('permit')
        } else {
          blockedReasons.push({
            kind: 'permit',
            label: input.permitsEnabled ? '必要: 遊漁券' : '必要: 遊漁券（未実装）',
          })
        }
        break
      }

      case 'relationship': {
        if (input.reputationEnabled) {
          blockedReasons.push({ kind: 'relationship', label: '必要: 人脈（未実装）' })
        } else {
          satisfiedKinds.push('relationship')
        }
        break
      }

      case 'season': {
        if (input.month === undefined || requirement.months.includes(input.month as never)) {
          satisfiedKinds.push('season')
        } else {
          blockedReasons.push({
            kind: 'season',
            label: `季節外（${requirement.months.map((month) => `${String(month)}月`).join('・')}）`,
          })
        }
        break
      }
    }
  }

  if (
    travelOptions.length === 0 &&
    blockedReasons.every((reason) => reason.kind !== 'capability')
  ) {
    blockedReasons.push({
      kind: 'capability',
      label: '行き方が分からない（利用できる移動手段がない）',
    })
  }

  return {
    spotId: String(spot.id),
    accessible: blockedReasons.length === 0 && travelOptions.length > 0,
    travelOptions,
    blockedReasons,
    satisfiedKinds,
  }
}

export const fastestTravelOption = (
  options: readonly ResolvedTravelOption[],
): ResolvedTravelOption | null => options[0] ?? null
