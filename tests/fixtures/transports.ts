import {
  createTransportState,
  grantOwnedTransport,
  type PlayerTransportState,
  type TransportDefinition,
} from '../../src/domain/access/Transport'
import { asTransportId } from '../../src/domain/ids'

const definition = (
  input: Pick<
    TransportDefinition,
    'id' | 'name' | 'transportType' | 'ownershipModel' | 'capabilities'
  > &
    Partial<TransportDefinition>,
): TransportDefinition => ({
  id: input.id,
  name: input.name,
  transportType: input.transportType,
  ownershipModel: input.ownershipModel,
  travelCostModel: input.travelCostModel ?? { kind: 'free' },
  travelTimeModifier: input.travelTimeModifier ?? 1,
  cargo: input.cargo ?? { gearUnits: 1, maxWeightKg: 10 },
  capabilities: input.capabilities,
  requiredRouteFeatures: input.requiredRouteFeatures ?? [],
  launchCapability: input.launchCapability ?? 'none',
  boatCapability: input.boatCapability ?? 'none',
  passengerCapacity: input.passengerCapacity ?? 1,
  ...(input.purchasePrice === undefined ? {} : { purchasePrice: input.purchasePrice }),
  ...(input.rentalCost === undefined ? {} : { rentalCost: input.rentalCost }),
  ...(input.maxRangeKm === undefined ? {} : { maxRangeKm: input.maxRangeKm }),
})

export const TEST_TRANSPORTS: readonly TransportDefinition[] = [
  definition({
    id: asTransportId('walk'),
    name: '徒歩',
    transportType: 'walk',
    ownershipModel: 'always_available',
    capabilities: ['reachable_on_foot'],
    maxRangeKm: 12,
  }),
  definition({
    id: asTransportId('train'),
    name: '鉄道',
    transportType: 'train',
    ownershipModel: 'always_available',
    capabilities: ['public_transport'],
    travelCostModel: { kind: 'route_fare' },
  }),
  definition({
    id: asTransportId('bus'),
    name: 'バス',
    transportType: 'bus',
    ownershipModel: 'always_available',
    capabilities: ['public_transport'],
    travelCostModel: { kind: 'route_fare' },
  }),
  definition({
    id: asTransportId('city-bicycle'),
    name: '自転車',
    transportType: 'bicycle',
    ownershipModel: 'owned',
    purchasePrice: 35_000,
    capabilities: ['bicycle_access'],
    maxRangeKm: 35,
  }),
  definition({
    id: asTransportId('standard-motorcycle'),
    name: 'オートバイ',
    transportType: 'motorcycle',
    ownershipModel: 'owned',
    purchasePrice: 280_000,
    travelCostModel: { kind: 'per_km', yenPerKm: 12, minimumOneWayCost: 100 },
    travelTimeModifier: 0.55,
    maxRangeKm: 250,
    capabilities: ['road_access'],
  }),
  definition({
    id: asTransportId('used-compact-car'),
    name: '中古コンパクトカー',
    transportType: 'compact_car',
    ownershipModel: 'owned',
    purchasePrice: 450_000,
    travelTimeModifier: 0.5,
    maxRangeKm: 600,
    capabilities: ['road_access'],
  }),
  definition({
    id: asTransportId('four-wheel-drive-suv'),
    name: '四輪駆動SUV',
    transportType: 'suv',
    ownershipModel: 'owned',
    purchasePrice: 2_200_000,
    travelCostModel: { kind: 'per_km', yenPerKm: 25, minimumOneWayCost: 300 },
    travelTimeModifier: 0.48,
    maxRangeKm: 700,
    capabilities: ['road_access', 'rough_road'],
  }),
  definition({
    id: asTransportId('rental-car'),
    name: 'レンタカー',
    transportType: 'rental_car',
    ownershipModel: 'rental',
    rentalCost: 9_000,
    travelTimeModifier: 0.62,
    maxRangeKm: 600,
    capabilities: ['road_access'],
    requiredRouteFeatures: ['vehicle_rental'],
  }),
  definition({
    id: asTransportId('recreational-kayak'),
    name: 'レクリエーショナルカヤック',
    transportType: 'kayak',
    ownershipModel: 'owned',
    purchasePrice: 160_000,
    maxRangeKm: 12,
    capabilities: ['kayak_launch'],
    requiredRouteFeatures: ['launch_point'],
    launchCapability: 'portable',
    boatCapability: 'nearshore',
  }),
  definition({
    id: asTransportId('rental-boat'),
    name: 'レンタルボート',
    transportType: 'rental_boat',
    ownershipModel: 'rental',
    rentalCost: 28_000,
    maxRangeKm: 80,
    capabilities: ['boat_required', 'offshore'],
    requiredRouteFeatures: ['boat_rental', 'marina'],
    launchCapability: 'marina',
    boatCapability: 'offshore',
  }),
  definition({
    id: asTransportId('owned-boat'),
    name: '所有ボート',
    transportType: 'owned_boat',
    ownershipModel: 'owned',
    purchasePrice: 4_800_000,
    maxRangeKm: 150,
    capabilities: ['boat_required', 'offshore'],
    requiredRouteFeatures: ['marina'],
    launchCapability: 'marina',
    boatCapability: 'offshore',
  }),
]

export const createTestTransportState = (
  options: {
    readonly available?: readonly string[]
    readonly owned?: readonly string[]
  } = {},
): PlayerTransportState => {
  let state = createTransportState(
    (options.available ?? ['walk', 'train', 'bus', 'rental-car', 'rental-boat']).map(asTransportId),
  )

  for (const id of options.owned ?? []) {
    state = grantOwnedTransport(state, asTransportId(id))
  }

  return state
}
