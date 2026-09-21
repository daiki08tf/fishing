import { describe, expect, it } from 'vitest'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import { createInitialFinanceState } from '../../src/domain/economy/FinanceState'
import { createInitialProgression } from '../../src/domain/progression'
import { asShopItemId } from '../../src/domain/ids'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../../src/state/playerStore'
import { createTestSpot } from '../fixtures/spots'
import { emptyCodexState } from '../../src/domain/codex'
import { createInitialWorld, grantTransport } from '../../src/domain/world/worldSession'

/**
 * Money → Asset → World Access の証明。
 *
 * 購入は World の移動手段を増やすだけで、AccessEngine のルールには触らない。
 */

const carSpot = createTestSpot({
  id: 'car-only-spot' as never,
  name: '車が要る釣り場',
  access: [{ kind: 'transport', tag: 'car' }],
  travelOptions: [{ transport: 'car', minutes: 95, cost: 900 }],
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
  grantsTransport: 'car' as const,
}

describe('economy and access', () => {
  it('blocks a car-only spot before the purchase', () => {
    const store = storeWithCash(900_000)
    const evaluation = store.getState().evaluateSpot(carSpot)

    expect(evaluation.accessible).toBe(false)
    expect(evaluation.blockedReasons[0]?.label).toContain('車')
  })

  it('opens the same spot after buying the car', () => {
    const store = storeWithCash(900_000)
    const purchase = store.getState().purchaseItem(carItem)

    expect(purchase.ok).toBe(true)
    expect(store.getState().finance.cash).toBe(450_000)
    expect(store.getState().world.availableTransports).toContain('car')
    expect(store.getState().evaluateSpot(carSpot).accessible).toBe(true)
  })

  it('does not change the access rules themselves', () => {
    const before = evaluateAccess({
      spot: carSpot,
      availableTransports: createInitialWorld().availableTransports,
      knowledge: emptyKnowledgeState(),
    })
    const withCar = evaluateAccess({
      spot: carSpot,
      availableTransports: grantTransport(createInitialWorld(), 'car').availableTransports,
      knowledge: emptyKnowledgeState(),
    })

    // 条件は同じ。使える移動手段が増えただけ。
    expect(before.blockedReasons.map((reason) => reason.kind)).toEqual(['transport', 'transport'])
    expect(withCar.blockedReasons).toEqual([])
    expect(carSpot.access).toEqual([{ kind: 'transport', tag: 'car' }])
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
