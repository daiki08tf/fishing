import { describe, expect, it } from 'vitest'
import { defaultTravelOption, roundTripCostFor } from '../../src/domain/economy'
import { grantOwnedTransport } from '../../src/domain/access/Transport'
import { createInitialFinanceState } from '../../src/domain/economy/FinanceState'
import { asTransportId } from '../../src/domain/ids'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../../src/state/playerStore'
import { createTestSpot } from '../fixtures/spots'
import { createTestTransportState, TEST_TRANSPORTS } from '../fixtures/transports'

/**
 * 移動手段の選択（Phase 7A.1）。
 *
 * Map は最も安い候補を初期選択し、プレイヤーが速い候補を選べる。
 * 「4 分速いだけの SUV を黙って選び、往復 ¥5,550 を課す」状態を作らない。
 */

const lakeSpot = createTestSpot({
  id: 'lake-spot' as never,
  name: '上流の湖',
  access: [{ kind: 'capability', capability: 'road_access' }],
  travelOptions: [
    {
      id: 'ordinary-road',
      transportTypes: ['compact_car', 'suv'],
      requiredCapabilities: ['road_access'],
      features: [],
      baseMinutes: 190,
      distanceKm: 75,
      baseOneWayCost: 900,
    },
  ],
})

const ownedTransportState = (owned: readonly string[], available: readonly string[] = ['walk']) =>
  owned.reduce(
    (state, id) => grantOwnedTransport(state, asTransportId(id)),
    createTestTransportState({ available }),
  )

const storeWithOwner = (cash: number, owned: readonly string[]) => {
  const store = createPlayerStore()

  store.getState().hydrateFromSave({
    ...createInitialSave({ now: '2026-05-01T00:00:00.000Z' }),
    finance: { ...createInitialFinanceState(), cash },
    transport: ownedTransportState(owned),
  })

  return store
}

describe('travel option selection', () => {
  it('offers every usable transport and sorts them by time', () => {
    const store = storeWithOwner(1_000_000, ['used-compact-car', 'four-wheel-drive-suv'])
    const options = store.getState().evaluateSpot(lakeSpot, TEST_TRANSPORTS).travelOptions

    expect(options.map((option) => String(option.transportId))).toEqual([
      'four-wheel-drive-suv',
      'used-compact-car',
    ])
    expect(options.map((option) => roundTripCostFor(option))).toEqual([5_550, 1_800])
  })

  it('defaults to the cheapest option instead of the fastest expensive one', () => {
    const store = storeWithOwner(1_000_000, ['used-compact-car', 'four-wheel-drive-suv'])
    const options = store.getState().evaluateSpot(lakeSpot, TEST_TRANSPORTS).travelOptions
    const picked = defaultTravelOption(options)

    expect(String(picked?.transportId)).toBe('used-compact-car')
    expect(picked?.minutes).toBe(95)
    // 既定は往復 ¥1,800。速いだけの SUV（¥5,550）を黙って選ばない。
    expect(roundTripCostFor(picked!)).toBe(1_800)
  })

  it('uses the explicitly selected transport time and cost', () => {
    const compact = storeWithOwner(1_000_000, ['used-compact-car', 'four-wheel-drive-suv'])
    const compactLeft = compact
      .getState()
      .travelToSpot(lakeSpot, TEST_TRANSPORTS, asTransportId('used-compact-car'))

    expect(compactLeft.ok).toBe(true)
    expect(compact.getState().finance.cash).toBe(1_000_000 - 1_800)
    expect(compact.getState().world.time.hour).toBe(7)
    expect(compact.getState().world.time.minute).toBe(35)

    const suv = storeWithOwner(1_000_000, ['used-compact-car', 'four-wheel-drive-suv'])
    const suvLeft = suv
      .getState()
      .travelToSpot(lakeSpot, TEST_TRANSPORTS, asTransportId('four-wheel-drive-suv'))

    expect(suvLeft.ok).toBe(true)
    expect(suv.getState().finance.cash).toBe(1_000_000 - 5_550)
    expect(suv.getState().world.trip?.transportId).toBe('four-wheel-drive-suv')
    // 91 分（SUV の time modifier 0.48）。
    expect(suv.getState().world.time.hour).toBe(7)
    expect(suv.getState().world.time.minute).toBe(31)
  })

  it('refuses the trip with a cost reason when the player cannot afford it', () => {
    const store = storeWithOwner(500, ['used-compact-car', 'four-wheel-drive-suv'])
    const options = store.getState().evaluateSpot(lakeSpot, TEST_TRANSPORTS).travelOptions
    const picked = defaultTravelOption(options)

    expect(String(picked?.transportId)).toBe('used-compact-car')

    const result = store.getState().travelToSpot(lakeSpot, TEST_TRANSPORTS, picked?.transportId)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.reason).toBe('cost')
    }

    expect(store.getState().finance.cash).toBe(500)
  })

  it('keeps ownership and travel state after a reload', async () => {
    const store = storeWithOwner(1_000_000, ['used-compact-car', 'four-wheel-drive-suv'])
    const left = store
      .getState()
      .travelToSpot(lakeSpot, TEST_TRANSPORTS, asTransportId('four-wheel-drive-suv'))

    expect(left.ok).toBe(true)

    const save = createInitialSave({ now: '2026-05-01T00:00:00.000Z' })
    const reloaded = createPlayerStore()
    reloaded.getState().hydrateFromSave({
      ...save,
      finance: { ...createInitialFinanceState(), cash: store.getState().finance.cash },
      transport: store.getState().transport,
      world: store.getState().world,
    })

    expect(reloaded.getState().transport.ownedTransportIds).toEqual(
      expect.arrayContaining(['used-compact-car', 'four-wheel-drive-suv']),
    )
    expect(reloaded.getState().world.trip?.transportId).toBe('four-wheel-drive-suv')

    const back = reloaded.getState().returnHome(lakeSpot, TEST_TRANSPORTS)

    expect(back.ok).toBe(true)
    // 往路と同じ SUV で帰る（帰りに別の移動手段へ差し替わらない）。
    // 06:00 + 91 分（往路） + 91 分（復路）。
    expect(reloaded.getState().world.time.hour).toBe(9)
    expect(reloaded.getState().world.time.minute).toBe(2)
  })
})
