import { describe, expect, it } from 'vitest'
import {
  findUnusableTransports,
  obtainableTransportIds,
} from '../../src/content/catalog/references'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import type {
  AccessCapability,
  TransportDefinition,
  TransportType,
} from '../../src/domain/access/Transport'
import { asShopItemId, asTransportId } from '../../src/domain/ids'
import type { ShopItem } from '../../src/domain/shop/ShopItem'
import { createTestSpot } from '../fixtures/spots'

/**
 * 入手できる Transport の route coverage（Phase 7A.1）。
 *
 * 購入・利用しても意味が無い Transport を Content 側で検出する。
 * 持ち主が現れない future-only Transport は対象外にする。
 */

const content = loadContentFromDirectory()

const transport = (input: {
  readonly id: string
  readonly transportType: TransportType
  readonly capabilities?: readonly AccessCapability[]
  readonly purchasePrice?: number
}): TransportDefinition => ({
  id: asTransportId(input.id),
  name: input.id,
  transportType: input.transportType,
  ownershipModel: 'owned',
  purchasePrice: input.purchasePrice ?? 100_000,
  travelCostModel: { kind: 'free' },
  travelTimeModifier: 1,
  cargo: { gearUnits: 1, maxWeightKg: 10 },
  capabilities: input.capabilities ?? ['road_access'],
  requiredRouteFeatures: [],
  launchCapability: 'none',
  boatCapability: 'none',
  passengerCapacity: 1,
})

const shopItem = (transportId: string): ShopItem => ({
  id: asShopItemId(`shop-${transportId}`),
  name: transportId,
  description: transportId,
  price: 100_000,
  category: 'vehicle',
  grantsTransportId: asTransportId(transportId),
})

const roadSpot = createTestSpot({
  access: [{ kind: 'capability', capability: 'road_access' }],
  travelOptions: [
    {
      id: 'road-route',
      transportTypes: ['compact_car'],
      requiredCapabilities: ['road_access'],
      features: [],
      baseMinutes: 60,
      distanceKm: 30,
      baseOneWayCost: 400,
    },
  ],
})

describe('transport route coverage', () => {
  it('keeps every obtainable transport of the shipped content usable', () => {
    expect(
      findUnusableTransports({
        transports: content.transports,
        spots: content.spots,
        shopItems: content.shopItems,
      }),
    ).toEqual([])
  })

  it('ships the generally available and purchasable transports of Phase 7A', () => {
    const ids = obtainableTransportIds(content.transports, content.shopItems)

    expect([...ids].sort()).toEqual([
      'bus',
      'city-bicycle',
      'four-wheel-drive-suv',
      'owned-boat',
      'recreational-kayak',
      'rental-boat',
      'rental-car',
      'standard-motorcycle',
      'train',
      'used-compact-car',
      'walk',
    ])
  })

  it('detects a purchasable transport without any usable route', () => {
    const phantom = transport({ id: 'phantom-suv', transportType: 'suv' })
    const issues = findUnusableTransports({
      transports: [transport({ id: 'used-compact-car', transportType: 'compact_car' }), phantom],
      spots: [roadSpot],
      shopItems: [shopItem('phantom-suv')],
    })

    expect(issues.map((issue) => issue.path)).toEqual(['transports/phantom-suv'])
  })

  it('detects a generally available transport without any usable route', () => {
    const issues = findUnusableTransports({
      transports: [transport({ id: 'walk', transportType: 'walk' })],
      spots: [roadSpot],
      shopItems: [],
    })

    expect(issues.map((issue) => issue.path)).toEqual(['transports/walk'])
  })

  it('ignores a future-only transport that the player cannot obtain yet', () => {
    const future = transport({ id: 'future-ferry', transportType: 'bus' })

    expect(
      findUnusableTransports({
        transports: [transport({ id: 'used-compact-car', transportType: 'compact_car' }), future],
        spots: [roadSpot],
        shopItems: [],
      }),
    ).toEqual([])
    expect(obtainableTransportIds([future], []).size).toBe(0)
  })

  it('does not report anything when transports or spots are missing', () => {
    expect(findUnusableTransports({ transports: [], spots: [roadSpot], shopItems: [] })).toEqual([])
    expect(
      findUnusableTransports({
        transports: [transport({ id: 'used-compact-car', transportType: 'compact_car' })],
        spots: [],
        shopItems: [],
      }),
    ).toEqual([])
  })
})
