import type { TransportId } from '../ids'

/**
 * Transport は「車名を AccessEngine の分岐へ増やす」ための enum ではなく、
 * Content から能力を供給する定義である。具体的な商品名・車種名は Domain Engine が知らない。
 */
export const TRANSPORT_TYPES = [
  'walk',
  'train',
  'bus',
  'bicycle',
  'motorcycle',
  'compact_car',
  'suv',
  'rental_car',
  'kayak',
  'rental_boat',
  'owned_boat',
] as const

export type TransportType = (typeof TRANSPORT_TYPES)[number]

/** Spot が要求し、TransportDefinition が提供する物理アクセス能力。 */
export const ACCESS_CAPABILITIES = [
  'reachable_on_foot',
  'public_transport',
  'bicycle_access',
  'road_access',
  'rough_road',
  'kayak_launch',
  'boat_required',
  'offshore',
  'island_access',
] as const

export type AccessCapability = (typeof ACCESS_CAPABILITIES)[number]

/** Route 側に必要な設備。実際の道路網や航路探索は扱わない。 */
export const ROUTE_FEATURES = ['vehicle_rental', 'launch_point', 'boat_rental', 'marina'] as const

export type RouteFeature = (typeof ROUTE_FEATURES)[number]

export const TRANSPORT_OWNERSHIP_MODELS = ['always_available', 'owned', 'rental'] as const
export type TransportOwnershipModel = (typeof TRANSPORT_OWNERSHIP_MODELS)[number]

export const LAUNCH_CAPABILITIES = ['none', 'portable', 'ramp', 'marina'] as const
export type LaunchCapability = (typeof LAUNCH_CAPABILITIES)[number]

export const BOAT_CAPABILITIES = ['none', 'nearshore', 'offshore'] as const
export type BoatCapability = (typeof BOAT_CAPABILITIES)[number]

/**
 * 片道費用の計算方法。Spot route の baseOneWayCost は運賃・通行料等の固定部分。
 * Phase 7A では燃料残量や実道路 routing は扱わない。
 */
export type TravelCostModel =
  | { readonly kind: 'route_fare' }
  | { readonly kind: 'free' }
  | {
      readonly kind: 'per_km'
      readonly yenPerKm: number
      readonly minimumOneWayCost: number
    }

export type CargoCapability = {
  /** 抽象化した Gear 積載枠。重量物理 simulation にはしない。 */
  readonly gearUnits: number
  readonly maxWeightKg: number
}

export type TransportDefinition = {
  readonly id: TransportId
  readonly name: string
  readonly transportType: TransportType
  readonly ownershipModel: TransportOwnershipModel

  readonly purchasePrice?: number
  /** rental は 1 釣行ごとの料金。往復で二重請求しない。 */
  readonly rentalCost?: number
  readonly travelCostModel: TravelCostModel
  /** Route の基準時間へ掛ける。小さいほど速い。 */
  readonly travelTimeModifier: number
  readonly maxRangeKm?: number

  readonly cargo: CargoCapability
  readonly capabilities: readonly AccessCapability[]
  readonly requiredRouteFeatures: readonly RouteFeature[]
  readonly launchCapability: LaunchCapability
  readonly boatCapability: BoatCapability
  readonly passengerCapacity: number
}

/** Save に載る、プレイヤー側の利用可能・所有状態。rental は釣行ごとに解決する。 */
export type PlayerTransportState = {
  /** 徒歩・公共交通と、所有によって解放された Transport。 */
  readonly availableTransportIds: readonly TransportId[]
  /** 購入した Transport。公共交通と rental は含めない。 */
  readonly ownedTransportIds: readonly TransportId[]
}

/**
 * 新規ゲームで選べる基礎移動。Rental は所有物ではなく、対応する route で都度料金を払う。
 * ID の実体化を境界から注入し、TransportDefinition 自体は Content 駆動のまま保つ。
 */
export const INITIAL_AVAILABLE_TRANSPORT_IDS = [
  'walk',
  'train',
  'bus',
  'rental-car',
  'rental-boat',
] as const

export const createTransportState = (
  availableTransportIds: readonly TransportId[] = [],
): PlayerTransportState => ({
  availableTransportIds: [...availableTransportIds],
  ownedTransportIds: [],
})

export const createInitialTransportState = (
  asId: (value: string) => TransportId,
): PlayerTransportState => createTransportState(INITIAL_AVAILABLE_TRANSPORT_IDS.map(asId))

export const ownsTransport = (state: PlayerTransportState, id: TransportId): boolean =>
  state.ownedTransportIds.includes(id)

/** 購入済み Transport を利用可能状態へ加える。重複は作らない。 */
export const grantOwnedTransport = (
  state: PlayerTransportState,
  id: TransportId,
): PlayerTransportState => ({
  availableTransportIds: state.availableTransportIds.includes(id)
    ? state.availableTransportIds
    : [...state.availableTransportIds, id],
  ownedTransportIds: state.ownedTransportIds.includes(id)
    ? state.ownedTransportIds
    : [...state.ownedTransportIds, id],
})

export type TravelCostComponentKind =
  | 'fare'
  | 'running_cost'
  | 'rental'
  | 'toll'
  | 'parking'
  | 'ferry'
  | 'lodging'
  | 'flight'
  | 'permit'
  | 'other'

export type TravelCostComponent = {
  readonly kind: TravelCostComponentKind
  readonly label: string
  readonly amount: number
  readonly charge: 'one_way' | 'per_trip'
}

/** AccessEngine が Content route と TransportDefinition から解決した 1 つの行き方。 */
export type ResolvedTravelOption = {
  readonly routeId: string
  readonly transportId: TransportId
  readonly transportType: TransportType
  readonly transportName: string
  readonly minutes: number
  readonly distanceKm: number
  readonly oneWayCost: number
  readonly perTripCost: number
  readonly costComponents: readonly TravelCostComponent[]
  readonly cargo: CargoCapability
  readonly capabilities: readonly AccessCapability[]
}
