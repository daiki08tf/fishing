import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'

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

  it('ships provisional verification spots for land and water access', () => {
    const ids = [
      'suburban-cycle-river',
      'forest-reservoir-arm',
      'sheltered-kayak-cove',
      'offshore-bank-provisional',
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
