import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { createInitialFinanceState } from '../../src/domain/economy/FinanceState'
import { planExpedition, type ExpeditionPlan } from '../../src/domain/expedition'
import { generateFishIndividual } from '../../src/domain/fish/generateFishIndividual'
import { asTransportId } from '../../src/domain/ids'
import { SeededRandomSource } from '../../src/domain/rng/SeededRandomSource'
import { createInitialSave } from '../../src/infrastructure/persistence/saveFactory'
import { migrateSave } from '../../src/infrastructure/persistence/migrateSave'
import { createPlayerStore, type PlayerStore } from '../../src/state/playerStore'

// 遠征の通し（Phase 8）。東京 → アラスカ → 釣り → 東京。
// 重要経路だけを確認する（費用 / 残高不足 / 時間 / 地域 / 許可 / 現地移動 /
// Codex / Save / 帰国 / 国内遠征）。

const content = loadContentFromDirectory()

const planFor = (expeditionId: string, options: Record<string, unknown> = {}): ExpeditionPlan => {
  const definition = content.expeditionById[expeditionId]
  const region =
    definition === undefined ? undefined : content.regionById[String(definition.regionId)]
  const country = region === undefined ? undefined : content.countryById[String(region.countryId)]

  if (definition === undefined || region === undefined || country === undefined) {
    throw new Error(`missing content for ${expeditionId}`)
  }

  const plan = planExpedition({
    definition,
    countryId: region.countryId,
    countryName: country.name,
    regionName: region.name,
    baseId: region.base.id,
    baseName: region.base.name,
    domestic: country.domestic,
    ...options,
  })

  if (plan === null) {
    throw new Error('could not plan the expedition')
  }

  return plan
}

const storeWithCash = (cash: number): PlayerStore => {
  const store = createPlayerStore()
  store.getState().hydrateFromSave({
    ...createInitialSave({ now: '2026-05-02T00:00:00.000Z' }),
    finance: { ...createInitialFinanceState(), cash },
  })

  return store
}

const spot = (id: string) => {
  const found = content.spots.find((entry) => String(entry.id) === id)

  if (found === undefined) {
    throw new Error(`missing spot ${id}`)
  }

  return found
}

describe('expedition flow', () => {
  it('prices Alaska as journey + lodging + permit in yen', () => {
    const plan = planFor('alaska-expedition', { nights: 5, lodgingId: 'alaska-budget-lodge' })

    expect(plan.domestic).toBe(false)
    expect(plan.totalCostYen).toBe(300_000 + 45_000 + 12_000)
    expect(plan.permitId).toBe('alaska-fishing-permit')
    expect(plan.baseName).toBe('Alaska Fishing Base')
  })

  it('refuses a trip the player cannot afford', () => {
    const store = storeWithCash(100_000)
    const result = store.getState().startExpedition(planFor('alaska-expedition'))

    expect(result.ok).toBe(false)
    expect(store.getState().finance.cash).toBe(100_000)
    expect(store.getState().expedition.current).toBeNull()
  })

  it('pays, advances the world time, moves to the base and grants the permit', () => {
    const store = storeWithCash(800_000)
    const before = store.getState().world.time
    const plan = planFor('alaska-expedition', { nights: 5, lodgingId: 'alaska-budget-lodge' })
    const result = store.getState().startExpedition(plan)

    expect(result.ok).toBe(true)
    expect(store.getState().finance.cash).toBe(800_000 - plan.totalCostYen)
    expect(store.getState().world.currentRegionId).toBe('alaska')
    expect(store.getState().world.time.day).toBeGreaterThan(before.day)
    expect(store.getState().expedition.current?.baseName).toBe('Alaska Fishing Base')
    expect(store.getState().expedition.permits.map(String)).toContain('alaska-fishing-permit')
    expect(store.getState().expedition.visitedRegionIds.map(String)).toContain('alaska')
    expect(store.getState().expeditionRemainingDays()).toBe(5)
  })

  it('does not allow fishing in a region the player is not in', () => {
    const store = storeWithCash(800_000)
    const away = store.getState().travelToSpot(spot('alaska-salmon-river'), content.transports)

    expect(away.ok).toBe(false)
    if (!away.ok) {
      expect(away.message).toContain('地域')
    }

    // 現地（アラスカ）から東京の釣り場へは戻れない（帰国してから）。
    store.getState().startExpedition(planFor('alaska-expedition'))

    const backToTokyo = store.getState().travelToSpot(spot('tokyo-urban-canal'), content.transports)

    expect(backToTokyo.ok).toBe(false)
  })

  it('travels locally with the rental car and records the catch in the Codex', () => {
    const store = storeWithCash(800_000)
    store.getState().startExpedition(planFor('alaska-expedition'))

    const salmon = spot('alaska-salmon-river')
    const access = store.getState().evaluateSpot(salmon, content.transports)

    expect(access.accessible).toBe(true)
    expect(access.travelOptions.map((option) => String(option.transportId))).toContain('rental-car')

    const travelled = store
      .getState()
      .travelToSpot(salmon, content.transports, asTransportId('rental-car'))

    expect(travelled.ok).toBe(true)
    expect(store.getState().world.phase).toBe('AT_SPOT')

    const species = content.speciesById['chinook-salmon']
    expect(species).toBeDefined()

    const { individual } = generateFishIndividual({
      species: species!,
      random: new SeededRandomSource('expedition-test'),
      individualSeed: 'chinook#1',
    })

    store.getState().recordCatch({
      individual,
      species: species!,
      spotId: String(salmon.id),
      capturedAt: '2026-05-03T00:00:00.000Z',
    })

    const recorded = store.getState().codex.species['chinook-salmon']

    expect(recorded).toBeDefined()
    expect(recorded?.catchCount).toBe(1)
    expect(store.getState().progression.anglerXp).toBeGreaterThan(0)

    const back = store.getState().returnHome(salmon, content.transports)

    expect(back.ok).toBe(true)
    expect(store.getState().world.phase).toBe('HOME')
  })

  it('blocks permit spots without the permit and opens them after the expedition', () => {
    const store = storeWithCash(800_000)
    const salmon = spot('alaska-salmon-river')
    const before = store.getState().evaluateSpot(salmon, content.transports)

    expect(before.accessible).toBe(false)
    expect(before.blockedReasons.map((reason) => reason.label).join(' ')).toContain('遊漁券')

    store.getState().startExpedition(planFor('alaska-expedition'))

    expect(store.getState().evaluateSpot(salmon, content.transports).accessible).toBe(true)
  })

  it('returns home and ends the expedition', () => {
    const store = storeWithCash(800_000)
    store.getState().startExpedition(planFor('alaska-expedition'))
    const beforeReturn = store.getState().world.time
    const result = store.getState().endExpedition()

    expect(result.ok).toBe(true)
    expect(store.getState().world.currentRegionId).toBe('tokyo-area')
    expect(store.getState().expedition.current).toBeNull()
    const minutes = (time: { day: number; hour: number; minute: number }): number =>
      (time.day * 24 + time.hour) * 60 + time.minute

    expect(minutes(store.getState().world.time)).toBeGreaterThan(minutes(beforeReturn))
  })

  it('keeps the expedition, the permit and the world through a reload', () => {
    const store = storeWithCash(800_000)
    store.getState().startExpedition(planFor('alaska-expedition'))

    const migrated = migrateSave({
      ...createInitialSave({ now: '2026-05-02T00:00:00.000Z' }),
      finance: store.getState().finance,
      world: store.getState().world,
      transport: store.getState().transport,
      expedition: store.getState().expedition,
      knowledge: store.getState().knowledge,
      codex: store.getState().codex,
      progression: store.getState().progression,
      inventory: store.getState().inventory,
      loadout: store.getState().loadout,
    })

    expect(migrated.ok).toBe(true)
    if (!migrated.ok) {
      return
    }

    const reloaded = createPlayerStore()
    reloaded.getState().hydrateFromSave(migrated.save)

    expect(reloaded.getState().world.currentRegionId).toBe('alaska')
    expect(reloaded.getState().expedition.current?.regionId).toBe('alaska')
    expect(reloaded.getState().expedition.permits.map(String)).toContain('alaska-fishing-permit')
    expect(
      reloaded.getState().evaluateSpot(spot('alaska-salmon-river'), content.transports).accessible,
    ).toBe(true)
  })

  it('sells a domestic expedition through the same model', () => {
    const store = storeWithCash(400_000)
    const plan = planFor('hokkaido-expedition', {
      nights: 3,
      lodgingId: 'hokkaido-riverside-lodge',
    })
    const result = store.getState().startExpedition(plan)

    expect(result.ok).toBe(true)
    expect(plan.domestic).toBe(true)
    expect(store.getState().world.currentRegionId).toBe('hokkaido')
    // 国内遠征は許可を要求しない。
    expect(
      store.getState().evaluateSpot(spot('hokkaido-river'), content.transports).accessible,
    ).toBe(true)
  })
})
