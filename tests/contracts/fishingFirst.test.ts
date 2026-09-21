import { describe, expect, it } from 'vitest'
import { formatWorldTime, type WorldTime } from '../../src/domain/world/WorldTime'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { createPlayerStore } from '../../src/state/playerStore'
import { createTestSpot } from '../fixtures/spots'

/**
 * Fishing-first の確認。
 *
 * 仕事の予定による釣行制限は無い。曜日は今後（混雑・大会・季節・釣り場ルール）
 * のために保持しているだけで、今は釣りを妨げない。
 */

const at = (day: number, hour: number, minute = 0): WorldTime => ({
  year: 2026,
  month: 5,
  day,
  hour,
  minute,
})

// 2026-05-04 は月曜、2026-05-09 は土曜。
const Monday = 4
const Saturday = 9

const storeAt = (time: WorldTime) => {
  const store = createPlayerStore()
  const base = createInitialSave({ now: '2026-05-01T00:00:00.000Z' })
  store.getState().hydrateFromSave({ ...base, world: { ...base.world, time } })
  return store
}

const walkSpot = createTestSpot({
  access: [{ kind: 'transport', tag: 'walk' }],
  travelOptions: [{ transport: 'walk', minutes: 20, cost: 0 }],
})

const trainSpot = createTestSpot({
  access: [{ kind: 'transport', tag: 'train' }],
  travelOptions: [{ transport: 'train', minutes: 45, cost: 420 }],
})

describe('fishing first', () => {
  it('allows a trip on a weekday', () => {
    const store = storeAt(at(Monday, 10))
    const result = store.getState().travelToSpot(walkSpot)

    expect(result.ok).toBe(true)
    expect(store.getState().world.phase).toBe('AT_SPOT')
  })

  it('allows a trip on a weekend', () => {
    const store = storeAt(at(Saturday, 10))
    const result = store.getState().travelToSpot(walkSpot)

    expect(result.ok).toBe(true)
  })

  it('allows a trip at night', () => {
    const store = storeAt(at(Monday, 23))
    const result = store.getState().travelToSpot(trainSpot)

    expect(result.ok).toBe(true)
  })

  it('advances time through travel, fishing and the return', () => {
    const store = storeAt(at(Monday, 6))
    const started = store.getState().world.time

    store.getState().travelToSpot(walkSpot)
    const arrived = store.getState().world.time
    expect(arrived.minute).toBe(20)

    store.getState().recordAttempt({ spot: walkSpot, outcome: 'failed', xpGained: 0 })
    const fished = store.getState().world.time
    expect(fished.minute).toBe(40)

    store.getState().returnHome(walkSpot)
    const home = store.getState().world.time
    expect(home.hour).toBe(7)
    expect(home.minute).toBe(0)

    expect(formatWorldTime(started)).toContain('06:00')
  })

  it('sleeps until the next morning from any time of day', () => {
    const store = storeAt(at(Monday, 22, 30))
    const result = store.getState().sleep()

    expect(result.ok).toBe(true)
    expect(store.getState().world.time.day).toBe(Monday + 1)
    expect(store.getState().world.time.hour).toBe(6)
    expect(store.getState().world.time.minute).toBe(0)

    const daytime = storeAt(at(Monday, 12))
    daytime.getState().sleep()

    expect(daytime.getState().world.time.day).toBe(Monday + 1)
    expect(daytime.getState().world.time.hour).toBe(6)
  })

  it('charges travel cost and keeps the walking spot free', () => {
    const paid = storeAt(at(Monday, 6))
    const before = paid.getState().finance.cash

    paid.getState().travelToSpot(trainSpot)

    expect(before - paid.getState().finance.cash).toBe(840)

    const free = createPlayerStore()
    const base = createInitialSave({ now: '2026-05-01T00:00:00.000Z' })
    free.getState().hydrateFromSave({
      ...base,
      world: { ...base.world, time: at(Monday, 6) },
      finance: { ...base.finance, cash: 0 },
    })

    // 所持金 0 でも徒歩の釣り場には行けて、釣りもできる。
    expect(free.getState().travelToSpot(walkSpot).ok).toBe(true)
    expect(
      free.getState().recordAttempt({ spot: walkSpot, outcome: 'failed', xpGained: 0 }).ok,
    ).toBe(true)
  })

  it('settles the freelance income when months pass', () => {
    const store = storeAt(at(31, 22))
    const before = store.getState().finance.cash

    store.getState().sleep()

    // 6 月に入ったので給与 − 生活費が入る。
    expect(store.getState().world.time.month).toBe(6)
    expect(store.getState().finance.cash).toBe(before + 120_000)
    expect(store.getState().finance.lastSettledMonth).toBe('2026-06')
  })
})
