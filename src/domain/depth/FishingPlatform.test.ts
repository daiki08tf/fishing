import { describe, expect, it } from 'vitest'
import type { TransportDefinition } from '../access/Transport'
import { asTransportId } from '../ids'
import { resolveFishingPlatform } from './FishingPlatform'

const baseTransport: Omit<TransportDefinition, 'id' | 'transportType' | 'boatCapability'> = {
  name: 'Test Transport',
  ownershipModel: 'owned',
  travelCostModel: { kind: 'free' },
  travelTimeModifier: 1,
  cargo: { gearUnits: 4, maxWeightKg: 20 },
  capabilities: [],
  requiredRouteFeatures: [],
  launchCapability: 'none',
  passengerCapacity: 1,
}

const transport = (
  transportType: TransportDefinition['transportType'],
  boatCapability: TransportDefinition['boatCapability'],
  overrides: Partial<TransportDefinition> = {},
): TransportDefinition => ({
  ...baseTransport,
  id: asTransportId(`test-${transportType}`),
  transportType,
  boatCapability,
  ...overrides,
})

describe('resolveFishingPlatform', () => {
  it('treats no transport (walking) as shore', () => {
    const context = resolveFishingPlatform(null)

    expect(context.platform).toBe('shore')
    expect(context.canPresentVertically).toBe(false)
    expect(context.canReposition).toBe(false)
  })

  it('treats boatCapability=none transports (train/car) as shore', () => {
    const context = resolveFishingPlatform(transport('compact_car', 'none'))

    expect(context.platform).toBe('shore')
  })

  it('recognizes a kayak as its own platform, checked before boatCapability', () => {
    const context = resolveFishingPlatform(
      transport('kayak', 'nearshore', { launchCapability: 'portable' }),
    )

    expect(context.platform).toBe('kayak')
    expect(context.canPresentVertically).toBe(true)
    expect(context.canReposition).toBe(true)
  })

  it('maps boatCapability=nearshore (non-kayak) to nearshore_boat', () => {
    const context = resolveFishingPlatform(
      transport('rental_boat', 'nearshore', { ownershipModel: 'rental', rentalCost: 10000 }),
    )

    expect(context.platform).toBe('nearshore_boat')
  })

  it('maps boatCapability=offshore to offshore_boat', () => {
    const context = resolveFishingPlatform(transport('owned_boat', 'offshore', { maxRangeKm: 150 }))

    expect(context.platform).toBe('offshore_boat')
    expect(context.maxRangeKm).toBe(150)
    expect(context.canPresentVertically).toBe(true)
  })

  it('carries transport name and cargo through for display', () => {
    const context = resolveFishingPlatform(transport('owned_boat', 'offshore', { name: 'My Boat' }))

    expect(context.transportName).toBe('My Boat')
    expect(context.cargo).toEqual({ gearUnits: 4, maxWeightKg: 20 })
  })
})
