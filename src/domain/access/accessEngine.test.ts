import { describe, expect, it } from 'vitest'
import { createTestSpot } from '../../../tests/fixtures/spots'
import { createTestTransportState, TEST_TRANSPORTS } from '../../../tests/fixtures/transports'
import { asPermitId, asRelationshipTargetId } from '../ids'
import { emptyKnowledgeState } from '../knowledge/KnowledgeState'
import { addSpotKnowledge } from '../knowledge/spotKnowledge'
import { ACCESS_REQUIREMENT_KINDS } from './AccessRequirement'
import { evaluateAccess, fastestTravelOption } from './accessEngine'

const base = {
  transports: TEST_TRANSPORTS,
  playerTransports: createTestTransportState(),
  knowledge: emptyKnowledgeState(),
}

describe('access engine', () => {
  it('resolves a capability from an available transport', () => {
    const evaluation = evaluateAccess({ ...base, spot: createTestSpot() })

    expect(evaluation.accessible).toBe(true)
    expect(evaluation.blockedReasons).toEqual([])
    expect(evaluation.travelOptions).toHaveLength(1)
    expect(evaluation.travelOptions[0]).toMatchObject({
      transportId: 'walk',
      transportType: 'walk',
      minutes: 20,
      oneWayCost: 0,
      perTripCost: 0,
    })
  })

  it('reports only the capability the player does not own, never the one they do', () => {
    const spot = createTestSpot({
      access: [
        { kind: 'capability', capability: 'road_access' },
        { kind: 'capability', capability: 'rough_road' },
      ],
      travelOptions: [
        {
          id: 'rough-road',
          transportTypes: ['compact_car', 'suv'],
          requiredCapabilities: ['road_access', 'rough_road'],
          features: [],
          baseMinutes: 90,
          distanceKm: 45,
          baseOneWayCost: 0,
        },
      ],
    })

    const compactOnly = createTestTransportState({ owned: ['used-compact-car'] })
    const evaluation = evaluateAccess({ ...base, spot, playerTransports: compactOnly })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.travelOptions).toEqual([])
    // compact car は road_access を持っているので「道路からのアクセス」は不足ではない。
    expect(evaluation.blockedReasons).toEqual([
      expect.objectContaining({ kind: 'missing_capability', capability: 'rough_road' }),
    ])
    expect(evaluation.blockedReasons.some((reason) => reason.capability === 'road_access')).toBe(
      false,
    )
  })

  it('asks for ownership instead of blaming a capability the vehicle provides', () => {
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [
        {
          id: 'car-only-route',
          transportTypes: ['compact_car'],
          requiredCapabilities: ['road_access'],
          features: [],
          baseMinutes: 60,
          distanceKm: 30,
          baseOneWayCost: 400,
        },
      ],
    })

    const motorcycleOnly = createTestTransportState({
      available: ['walk'],
      owned: ['standard-motorcycle'],
    })
    const evaluation = evaluateAccess({ ...base, spot, playerTransports: motorcycleOnly })

    expect(evaluation.accessible).toBe(false)
    // motorcycle は road_access を持つ。capability 不足ではなく「この route を通れる車両の所有」。
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toEqual(['ownership_required'])
    expect(evaluation.blockedReasons.some((reason) => reason.capability === 'road_access')).toBe(
      false,
    )
  })

  it('reports no compatible transport when no vehicle can use the route', () => {
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [
        {
          id: 'too-far-route',
          transportTypes: ['compact_car', 'suv', 'motorcycle', 'rental_car'],
          requiredCapabilities: ['road_access'],
          features: [],
          baseMinutes: 600,
          distanceKm: 5_000,
          baseOneWayCost: 900,
        },
      ],
    })
    const carOwner = createTestTransportState({ owned: ['used-compact-car'] })
    const evaluation = evaluateAccess({ ...base, spot, playerTransports: carOwner })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toEqual([
      'no_compatible_transport',
    ])
  })

  it('asks for ownership when only an unowned vehicle can use the route', () => {
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [
        {
          id: 'car-only-route',
          transportTypes: ['compact_car'],
          requiredCapabilities: ['road_access'],
          features: [],
          baseMinutes: 60,
          distanceKm: 30,
          baseOneWayCost: 400,
        },
      ],
    })

    const evaluation = evaluateAccess({ ...base, spot })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toEqual(['ownership_required'])
    expect(evaluation.blockedReasons[0]?.label).toContain('所有')
  })

  it('separates a missing rental facility from a missing rental service', () => {
    const route = {
      id: 'rental-route',
      transportTypes: ['rental_car'] as const,
      requiredCapabilities: ['road_access'] as const,
      features: [] as const,
      baseMinutes: 60,
      distanceKm: 30,
      baseOneWayCost: 400,
    }
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [route],
    })

    // レンタルは利用できるが、route に営業所（vehicle_rental）が無い。
    expect(evaluateAccess({ ...base, spot }).blockedReasons.map((reason) => reason.kind)).toEqual([
      'facility_required',
    ])

    // route に営業所があり、レンタルも利用できるなら行ける。
    const withFacility = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [{ ...route, features: ['vehicle_rental'] as const }],
    })
    expect(evaluateAccess({ ...base, spot: withFacility }).accessible).toBe(true)

    // レンタルが player state に無い場合は rental_unavailable。
    const noRental = createTestTransportState({
      available: ['walk', 'train', 'bus'],
      owned: ['standard-motorcycle'],
    })
    const evaluation = evaluateAccess({
      ...base,
      spot: withFacility,
      playerTransports: noRental,
    })

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons.map((reason) => reason.kind)).toEqual(['rental_unavailable'])
  })

  it('offers multiple valid transport options and sorts them deterministically', () => {
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'public_transport' }],
      travelOptions: [
        {
          id: 'train-route',
          transportTypes: ['train'],
          requiredCapabilities: ['public_transport'],
          features: [],
          baseMinutes: 38,
          distanceKm: 20,
          baseOneWayCost: 420,
        },
        {
          id: 'bus-route',
          transportTypes: ['bus'],
          requiredCapabilities: ['public_transport'],
          features: [],
          baseMinutes: 55,
          distanceKm: 18,
          baseOneWayCost: 520,
        },
      ],
    })

    const evaluation = evaluateAccess({ ...base, spot })

    expect(evaluation.travelOptions.map((option) => option.transportId)).toEqual(['train', 'bus'])
    expect(fastestTravelOption(evaluation.travelOptions)?.transportId).toBe('train')
    expect(evaluateAccess({ ...base, spot })).toEqual(evaluation)
  })

  it('requires ownership for an owned transport', () => {
    const spot = createTestSpot({
      access: [{ kind: 'capability', capability: 'road_access' }],
      travelOptions: [
        {
          id: 'car-route',
          transportTypes: ['compact_car'],
          requiredCapabilities: ['road_access'],
          features: [],
          baseMinutes: 190,
          distanceKm: 75,
          baseOneWayCost: 900,
        },
      ],
    })

    expect(evaluateAccess({ ...base, spot }).accessible).toBe(false)

    const owned = evaluateAccess({
      ...base,
      spot,
      playerTransports: createTestTransportState({ owned: ['used-compact-car'] }),
    })

    expect(owned.accessible).toBe(true)
    expect(owned.travelOptions[0]).toMatchObject({
      transportId: 'used-compact-car',
      minutes: 95,
      oneWayCost: 900,
    })
  })

  it('resolves rental availability, facilities, and per-trip cost without ownership', () => {
    const spot = createTestSpot({
      access: [
        { kind: 'capability', capability: 'boat_required' },
        { kind: 'capability', capability: 'offshore' },
      ],
      travelOptions: [
        {
          id: 'marina-rental',
          transportTypes: ['rental_boat'],
          requiredCapabilities: ['boat_required', 'offshore'],
          features: ['boat_rental', 'marina'],
          baseMinutes: 70,
          distanceKm: 25,
          baseOneWayCost: 2_000,
        },
      ],
    })

    const unavailable = evaluateAccess({
      ...base,
      spot,
      playerTransports: createTestTransportState({ available: ['walk'] }),
    })
    expect(unavailable.accessible).toBe(false)

    const rental = evaluateAccess({ ...base, spot })
    expect(rental.accessible).toBe(true)
    expect(rental.travelOptions[0]).toMatchObject({
      transportId: 'rental-boat',
      oneWayCost: 2_000,
      perTripCost: 28_000,
    })
    expect(rental.travelOptions[0]?.costComponents).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'rental', charge: 'per_trip' })]),
    )
  })

  it('does not combine capabilities from unrelated transports', () => {
    const spot = createTestSpot({
      access: [
        { kind: 'capability', capability: 'road_access' },
        { kind: 'capability', capability: 'offshore' },
      ],
      travelOptions: [
        {
          id: 'impossible-route',
          transportTypes: ['compact_car', 'owned_boat'],
          requiredCapabilities: [],
          features: ['marina'],
          baseMinutes: 30,
          distanceKm: 10,
          baseOneWayCost: 0,
        },
      ],
    })
    const playerTransports = createTestTransportState({
      owned: ['used-compact-car', 'owned-boat'],
    })

    expect(evaluateAccess({ ...base, spot, playerTransports }).accessible).toBe(false)
  })

  it('keeps knowledge and permit requirements orthogonal to physical access', () => {
    const spot = createTestSpot({
      access: [
        { kind: 'capability', capability: 'reachable_on_foot' },
        { kind: 'knowledge', minimum: 20 },
        { kind: 'permit', permitId: asPermitId('test-permit') },
      ],
    })

    expect(evaluateAccess({ ...base, spot }).accessible).toBe(false)

    const knownAndPermitted = evaluateAccess({
      ...base,
      spot,
      knowledge: addSpotKnowledge(emptyKnowledgeState(), 'test-spot', 20),
      permitsEnabled: true,
      permits: ['test-permit'],
    })
    expect(knownAndPermitted.accessible).toBe(true)
  })

  it('never uses Angler Level as an access gate', () => {
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('level')
    expect(ACCESS_REQUIREMENT_KINDS).not.toContain('anglerLevel')

    const spot = createTestSpot()
    const first = evaluateAccess({ ...base, spot })
    const afterUnrelatedProgression = evaluateAccess({ ...base, spot, reputation: 999 })

    expect(afterUnrelatedProgression.accessible).toBe(first.accessible)
    expect(afterUnrelatedProgression.travelOptions).toEqual(first.travelOptions)
  })

  it('gates a relationship requirement on the given contactTrust map (Phase 17C)', () => {
    const spot = createTestSpot({
      access: [
        {
          kind: 'relationship',
          targetId: asRelationshipTargetId('captain-x'),
          minimum: 30,
        },
      ],
    })

    // 未渡し（省略）は Trust 0 扱いなので拒否される。無条件通過にはしない。
    const withoutTrustMap = evaluateAccess({ ...base, spot })
    expect(withoutTrustMap.accessible).toBe(false)
    expect(withoutTrustMap.blockedReasons).toEqual([
      expect.objectContaining({ kind: 'relationship', required: 30, current: 0 }),
    ])

    const belowThreshold = evaluateAccess({
      ...base,
      spot,
      contactTrust: { 'captain-x': 10 },
    })
    expect(belowThreshold.accessible).toBe(false)

    const aboveThreshold = evaluateAccess({
      ...base,
      spot,
      contactTrust: { 'captain-x': 30 },
    })
    expect(aboveThreshold.accessible).toBe(true)
    expect(aboveThreshold.blockedReasons).toEqual([])
  })
})
