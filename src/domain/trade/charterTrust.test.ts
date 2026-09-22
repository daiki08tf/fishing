import { describe, expect, it } from 'vitest'
import { asContactId, asTransportId } from '../ids'
import type { TransportDefinition } from '../access/Transport'
import {
  CHARTER_BASE_TRUST_GAIN,
  CHARTER_MAX_CATCH_BONUS,
  applyCharterTripOutcome,
} from './charterTrust'
import { createInitialTradeState, trustOf } from './TradeState'

const charterBoat: TransportDefinition = {
  id: asTransportId('charter-boat'),
  name: 'チャーター船',
  transportType: 'charter_boat',
  ownershipModel: 'rental',
  rentalCost: 45000,
  travelCostModel: { kind: 'per_km', yenPerKm: 40, minimumOneWayCost: 2000 },
  travelTimeModifier: 0.4,
  maxRangeKm: 100,
  cargo: { gearUnits: 12, maxWeightKg: 250 },
  capabilities: ['boat_required', 'offshore', 'island_access'],
  requiredRouteFeatures: ['marina'],
  launchCapability: 'marina',
  boatCapability: 'offshore',
  passengerCapacity: 6,
  operatorContactId: asContactId('captain-taro'),
}

const rentalBoat: TransportDefinition = {
  ...charterBoat,
  id: asTransportId('rental-boat'),
  transportType: 'rental_boat',
  operatorContactId: undefined,
}

describe('applyCharterTripOutcome', () => {
  it('does nothing when the transport has no operatorContactId', () => {
    const trade = createInitialTradeState()
    const outcome = applyCharterTripOutcome(trade, rentalBoat, 3)

    expect(outcome.trustGain).toBe(0)
    expect(outcome.contactId).toBeNull()
    expect(outcome.trade).toBe(trade)
  })

  it('does nothing when there is no transport at all (e.g. walked home)', () => {
    const trade = createInitialTradeState()
    const outcome = applyCharterTripOutcome(trade, null, 0)

    expect(outcome.trustGain).toBe(0)
    expect(outcome.trade).toBe(trade)
  })

  it('grants base trust even on a skunk trip (zero catches)', () => {
    const trade = createInitialTradeState()
    const outcome = applyCharterTripOutcome(trade, charterBoat, 0)

    expect(outcome.trustGain).toBe(CHARTER_BASE_TRUST_GAIN)
    expect(trustOf(outcome.trade, charterBoat.operatorContactId!)).toBe(CHARTER_BASE_TRUST_GAIN)
  })

  it('adds a small, capped catch bonus on top of the base gain', () => {
    const trade = createInitialTradeState()
    const outcome = applyCharterTripOutcome(trade, charterBoat, 1)

    expect(outcome.trustGain).toBe(CHARTER_BASE_TRUST_GAIN + 1)
  })

  it('caps the catch bonus regardless of how many fish were landed', () => {
    const trade = createInitialTradeState()
    const outcome = applyCharterTripOutcome(trade, charterBoat, 50)

    expect(outcome.trustGain).toBe(CHARTER_BASE_TRUST_GAIN + CHARTER_MAX_CATCH_BONUS)
  })

  it('never pushes trust above 100', () => {
    const trade = {
      ...createInitialTradeState(),
      contactTrust: { [String(charterBoat.operatorContactId)]: 99 },
    }
    const outcome = applyCharterTripOutcome(trade, charterBoat, 5)

    expect(trustOf(outcome.trade, charterBoat.operatorContactId!)).toBe(100)
  })
})
