import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import {
  createInitialTransportState,
  createTransportState,
  grantOwnedTransport,
  type PlayerTransportState,
} from '../../src/domain/access/Transport'
import { asTransportId } from '../../src/domain/ids'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'

const content = loadContentFromDirectory()

const transport = (id: string) => {
  const definition = content.transportById[id]
  if (definition === undefined) {
    throw new Error(`missing transport content: ${id}`)
  }
  return definition
}

const spot = (id: string) => {
  const definition = content.spots.find((entry) => String(entry.id) === id)
  if (definition === undefined) {
    throw new Error(`missing spot content: ${id}`)
  }
  return definition
}

describe('Phase 7A transport content', () => {
  const ownedBy = (...ids: readonly string[]): PlayerTransportState =>
    ids.reduce(
      (state, id) => grantOwnedTransport(state, asTransportId(id)),
      createInitialTransportState(asTransportId),
    )

  /** Rental / 所有の効果だけを見たい検査用（貸し出し可能な船などを混ぜない）。 */
  const withAvailable = (
    available: readonly string[],
    owned: readonly string[] = [],
  ): PlayerTransportState =>
    owned.reduce(
      (state, id) => grantOwnedTransport(state, asTransportId(id)),
      createTransportState(available.map(asTransportId)),
    )

  const accessible = (spotId: string, playerTransports: PlayerTransportState): boolean =>
    evaluateAccess({
      spot: spot(spotId),
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
    }).accessible

  const optionIds = (spotId: string, playerTransports: PlayerTransportState): readonly string[] =>
    evaluateAccess({
      spot: spot(spotId),
      transports: content.transports,
      playerTransports,
      knowledge: emptyKnowledgeState(),
    }).travelOptions.map((option) => String(option.transportId))

  it('ships every representative transport as data', () => {
    expect(content.transports.map((entry) => entry.transportType)).toEqual(
      expect.arrayContaining([
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
      ]),
    )
  })

  it('keeps road and water capabilities intentionally distinct', () => {
    expect(transport('used-compact-car').capabilities).toContain('road_access')
    expect(transport('used-compact-car').capabilities).not.toContain('rough_road')
    expect(transport('used-compact-car').capabilities).not.toContain('offshore')

    expect(transport('four-wheel-drive-suv').capabilities).toContain('rough_road')
    expect(transport('four-wheel-drive-suv').capabilities).not.toContain('boat_required')
    expect(transport('four-wheel-drive-suv').capabilities).not.toContain('offshore')

    expect(transport('recreational-kayak').boatCapability).toBe('nearshore')
    expect(transport('recreational-kayak').capabilities).not.toContain('offshore')
    expect(transport('rental-boat').capabilities).toContain('offshore')
    expect(transport('owned-boat').capabilities).toContain('offshore')
  })

  it('models purchase and rental economy without a second currency', () => {
    expect(transport('city-bicycle')).toMatchObject({
      ownershipModel: 'owned',
      purchasePrice: 35_000,
    })
    expect(transport('rental-car')).toMatchObject({
      ownershipModel: 'rental',
      rentalCost: 9_000,
    })
    expect(transport('rental-boat')).toMatchObject({
      ownershipModel: 'rental',
      rentalCost: 28_000,
    })
    expect(transport('owned-boat')).toMatchObject({
      ownershipModel: 'owned',
      purchasePrice: 4_800_000,
    })
  })

  it('gives the motorcycle a general road route without off-road capabilities', () => {
    const motorcycle = withAvailable(['walk', 'train', 'bus'], ['standard-motorcycle'])

    expect(optionIds('upstream-lake', motorcycle)).toEqual(['standard-motorcycle'])
    expect(transport('standard-motorcycle').capabilities).not.toContain('rough_road')
    expect(accessible('forest-reservoir-arm', motorcycle)).toBe(false)
    expect(accessible('offshore-bank-provisional', motorcycle)).toBe(false)
    expect(accessible('sheltered-kayak-cove', motorcycle)).toBe(false)
  })

  it('gives the rental car a general road route with a rental desk', () => {
    const rentalCar = withAvailable(['walk', 'train', 'bus', 'rental-car'])

    expect(optionIds('suburban-road-lake', rentalCar)).toContain('rental-car')
    expect(transport('rental-car').requiredRouteFeatures).toEqual(['vehicle_rental'])
    expect(transport('rental-car').capabilities).toEqual(['road_access'])
  })

  it('keeps the rental car away from rough road, water and offshore access', () => {
    const rentalCar = withAvailable(['walk', 'train', 'bus', 'rental-car'])

    expect(accessible('forest-reservoir-arm', rentalCar)).toBe(false)
    expect(accessible('sheltered-kayak-cove', rentalCar)).toBe(false)
    expect(accessible('offshore-bank-provisional', rentalCar)).toBe(false)
    expect(accessible('suburban-cycle-river', rentalCar)).toBe(false)
  })

  it('keeps the compact car cheaper and slower than the SUV at the same route', () => {
    const both = ownedBy('used-compact-car', 'four-wheel-drive-suv')
    const options = evaluateAccess({
      spot: spot('upstream-lake'),
      transports: content.transports,
      playerTransports: both,
      knowledge: emptyKnowledgeState(),
    }).travelOptions
    const compact = options.find((option) => String(option.transportId) === 'used-compact-car')
    const suv = options.find((option) => String(option.transportId) === 'four-wheel-drive-suv')

    expect(compact?.minutes).toBe(95)
    expect(suv?.minutes).toBe(91)
    expect(compact!.oneWayCost).toBe(900)
    expect(suv!.oneWayCost).toBeGreaterThan(compact!.oneWayCost)
  })

  it('ships provisional verification spots for land and water access', () => {
    const ids = [
      'suburban-cycle-river',
      'forest-reservoir-arm',
      'sheltered-kayak-cove',
      'offshore-bank-provisional',
      'suburban-road-lake',
    ]

    for (const id of ids) {
      expect(spot(id).dataStatus).toBe('provisional')
    }

    expect(spot('forest-reservoir-arm').access).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: 'road_access' },
        { kind: 'capability', capability: 'rough_road' },
      ]),
    )
    expect(spot('offshore-bank-provisional').access).toEqual(
      expect.arrayContaining([
        { kind: 'capability', capability: 'boat_required' },
        { kind: 'capability', capability: 'offshore' },
      ]),
    )
  })
})
