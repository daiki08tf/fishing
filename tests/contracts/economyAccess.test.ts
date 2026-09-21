import { describe, expect, it } from 'vitest'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import { grantOwnedTransport } from '../../src/domain/access/Transport'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import { createInitialFinanceState } from '../../src/domain/economy/FinanceState'
import { createInitialProgression } from '../../src/domain/progression'
import { asShopItemId, asTransportId } from '../../src/domain/ids'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../../src/state/playerStore'
import { createTestSpot } from '../fixtures/spots'
import { emptyCodexState } from '../../src/domain/codex'
import { createTestTransportState, TEST_TRANSPORTS } from '../fixtures/transports'

/**
 * Money → Asset → World Access の証明。
 *
 * 購入は World の移動手段を増やすだけで、AccessEngine のルールには触らない。
 */

const carSpot = createTestSpot({
  id: 'car-only-spot' as never,
  name: '車が要る釣り場',
  access: [{ kind: 'capability', capability: 'road_access' }],
  travelOptions: [
    {
      id: 'existing-car-route',
      transportTypes: ['compact_car'],
      requiredCapabilities: ['road_access'],
      features: [],
      baseMinutes: 190,
      distanceKm: 75,
      baseOneWayCost: 900,
    },
  ],
})

const base = createInitialSave({ now: '2026-05-01T00:00:00.000Z' })

const storeWithCash = (cash: number) => {
  const store = createPlayerStore()
  store.getState().hydrateFromSave({
    ...base,
    finance: { ...createInitialFinanceState(), cash },
  })
  return store
}

const carItem = {
  id: asShopItemId('used-compact-car'),
  name: '中古コンパクトカー',
  description: '車',
  price: 450_000,
  category: 'vehicle' as const,
  grantsTransportId: asTransportId('used-compact-car'),
}

describe('economy and access', () => {
  it('blocks a car-only spot before the purchase', () => {
    const store = storeWithCash(900_000)
    const evaluation = store.getState().evaluateSpot(carSpot, TEST_TRANSPORTS)

    expect(evaluation.accessible).toBe(false)
    // capability を持っていないのではなく、この釣り場へ行ける車両を所有していない。
    expect(evaluation.blockedReasons[0]?.kind).toBe('ownership_required')
    expect(evaluation.blockedReasons[0]?.label).toContain('所有')
  })

  it('opens the same spot after buying the car', () => {
    const store = storeWithCash(900_000)
    const purchase = store.getState().purchaseItem(carItem)

    expect(purchase.ok).toBe(true)
    expect(store.getState().finance.cash).toBe(450_000)
    expect(store.getState().transport.ownedTransportIds).toContain('used-compact-car')
    expect(store.getState().evaluateSpot(carSpot, TEST_TRANSPORTS).accessible).toBe(true)
  })

  it('does not change the access rules themselves', () => {
    const before = evaluateAccess({
      spot: carSpot,
      transports: TEST_TRANSPORTS,
      playerTransports: createTestTransportState(),
      knowledge: emptyKnowledgeState(),
    })
    const withCar = evaluateAccess({
      spot: carSpot,
      transports: TEST_TRANSPORTS,
      playerTransports: grantOwnedTransport(
        createTestTransportState(),
        asTransportId('used-compact-car'),
      ),
      knowledge: emptyKnowledgeState(),
    })

    // 条件は同じ。使える移動手段が増えただけ。
    expect(before.blockedReasons.map((reason) => reason.kind)).toEqual(['ownership_required'])
    expect(withCar.blockedReasons).toEqual([])
    expect(carSpot.access).toEqual([{ kind: 'capability', capability: 'road_access' }])
  })

  it('keeps the rest of the player state untouched by the purchase', () => {
    const store = storeWithCash(900_000)
    const before = {
      progression: createInitialProgression(),
      codex: emptyCodexState(),
    }

    store.getState().purchaseItem(carItem)

    expect(store.getState().progression).toEqual(before.progression)
    expect(store.getState().codex).toEqual(before.codex)
  })
})
