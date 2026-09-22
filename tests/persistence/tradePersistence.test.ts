import { afterEach, describe, expect, it } from 'vitest'
import {
  createPersistenceCoordinator,
  type PersistenceCoordinator,
} from '../../src/app/persistence/persistenceCoordinator'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import {
  asContactId,
  asContactRewardId,
  asFishIndividualId,
  asRegionId,
} from '../../src/domain/ids'
import type { SaveRepository } from '../../src/domain/save/SaveRepository'
import type { CurrentSave, SaveGameV9 } from '../../src/domain/save/SaveGame'
import { DEFAULT_WORLD_TUNING } from '../../src/domain/world/WorldTuning'
import type { BuyerDefinition } from '../../src/domain/trade/Buyer'
import type { ContactReward } from '../../src/domain/trade/ContactReward'
import type { SpeciesTradeProfile } from '../../src/domain/trade/SpeciesTradeProfile'
import { createPlayerStore, type PlayerStore } from '../../src/state/playerStore'
import { createValidSaveV9 } from '../fixtures/save'
import { createTestSpecies } from '../fixtures/species'
import { createTestSpot } from '../fixtures/spots'

/**
 * Phase 13.1 — Trade の永続化を **実際の coordinator / repository 経路**で確認する。
 *
 * ここが壊れていると（Save payload に trade が無い / 変更検知に trade が無い）、
 * 釣った魚も Trust も報酬も reload で消える。simulate の単純な spread ではなく、
 * Store → coordinator → repository → 新しい Store の往復で検証する。
 */

class FakeSaveRepository implements SaveRepository {
  stored: unknown = null
  saveCalls = 0

  loadRaw(): Promise<unknown | null> {
    return Promise.resolve(this.stored)
  }

  save(save: CurrentSave): Promise<void> {
    this.saveCalls += 1
    // 永続化（IndexedDB / structured clone）と同じく参照ではなくコピーを保存する。
    this.stored = JSON.parse(JSON.stringify(save)) as unknown
    return Promise.resolve()
  }

  clear(): Promise<void> {
    this.stored = null
    return Promise.resolve()
  }

  saved(): SaveGameV9 {
    return this.stored as SaveGameV9
  }
}

const species = createTestSpecies()
const spot = createTestSpot()
const coordinators: PersistenceCoordinator[] = []

afterEach(() => {
  for (const coordinator of coordinators) {
    coordinator.stop()
  }
  coordinators.length = 0
})

const setup = (
  stored: unknown = createValidSaveV9(),
): {
  readonly repository: FakeSaveRepository
  readonly store: PlayerStore
  readonly coordinator: PersistenceCoordinator
} => {
  const repository = new FakeSaveRepository()
  repository.stored = stored
  const store = createPlayerStore()
  const coordinator = createPersistenceCoordinator({
    repository,
    store,
    now: () => '2026-05-02T00:00:00.000Z',
  })
  coordinators.push(coordinator)

  return { repository, store, coordinator }
}

const individualWith = (id: string, overrides: Partial<FishIndividual> = {}): FishIndividual => ({
  id: asFishIndividualId(id),
  speciesId: species.id,
  lengthCm: 30,
  weightKg: 0.5,
  condition: 0.6,
  traits: [],
  fightSeed: id,
  percentile: 60,
  ...overrides,
})

const keep = (store: PlayerStore, id: string): FishIndividual => {
  const individual = individualWith(id)
  store.getState().keepCatch(individual, spot)
  return individual
}

/** 現在地域（東京近郊）のテスト用買取先。 */
const tokyoBuyer = (overrides: Partial<BuyerDefinition> = {}): BuyerDefinition => ({
  id: asContactId('test-izakaya'),
  name: 'テスト居酒屋',
  buyerType: 'izakaya',
  regionId: asRegionId(DEFAULT_WORLD_TUNING.homeRegionId),
  description: 'test buyer',
  pricingProfile: {
    baseMultiplier: 1,
    qualitySensitivity: 1,
    sizeSensitivity: 1,
    freshnessSensitivity: 0.5,
    volumeBonusPerExtraCatch: 0,
    maxVolumeBonus: 0,
  },
  trustProfile: { perTransactionBase: 2, qualityWeight: 4, maxPerTransaction: 6 },
  preferences: {
    preferredTags: ['everyday'],
    neutralTags: ['white_fish'],
    preferredTagMultiplier: 1.15,
    neutralTagMultiplier: 1,
    otherTagMultiplier: 0.85,
    localSourceMultiplier: 1.1,
  },
  ...overrides,
})

const tradeProfile = (): SpeciesTradeProfile => ({
  speciesId: species.id,
  tradeStatus: 'tradable',
  tradeTags: ['everyday'],
  baseYenPerKg: 1200,
  minimumUnitValueYen: 200,
  qualitySensitivity: 1,
  sizeSensitivity: 1,
})

const tradeProfiles = { [String(species.id)]: tradeProfile() }

describe('trade persistence (Keep / Sell / Reward round trips)', () => {
  it('keeps a Kept fish in the Fish Box after flush + reload', async () => {
    const { repository, store, coordinator } = setup()
    await coordinator.start()

    const kept = keep(store, 'catch-keep')

    expect(store.getState().trade.fishBox).toHaveLength(1)

    await coordinator.flush()

    // Save payload に trade が入っている（これが無いと reload で消える）。
    expect(repository.saved().trade.fishBox).toHaveLength(1)
    expect(repository.saved().trade.fishBox[0]?.catchId).toBe(kept.id)

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()

    const fishBox = reloaded.store.getState().trade.fishBox

    expect(fishBox).toHaveLength(1)
    expect(fishBox[0]?.catchId).toBe(kept.id)
    expect(fishBox[0]?.speciesId).toBe(species.id)
    expect(fishBox[0]?.weightKg).toBeCloseTo(0.5)
  })

  it('does not resurrect a sold fish after flush + reload, and keeps the cash', async () => {
    const { repository, store, coordinator } = setup()
    await coordinator.start()

    const sold = keep(store, 'catch-sell')
    const remaining = keep(store, 'catch-keep-2')
    const cashBefore = store.getState().finance.cash

    const result = store.getState().sellToBuyer({
      buyer: tokyoBuyer(),
      catchIds: [sold.id],
      tradeProfileBySpeciesId: tradeProfiles,
      rewards: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const cashAfterSale = store.getState().finance.cash
    expect(cashAfterSale).toBeGreaterThan(cashBefore)
    expect(store.getState().trade.fishBox.map((entry) => String(entry.catchId))).toEqual([
      String(remaining.id),
    ])

    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()
    const state = reloaded.store.getState()

    expect(state.trade.fishBox.map((entry) => String(entry.catchId))).toEqual([
      String(remaining.id),
    ])
    expect(state.trade.fishBox.some((entry) => entry.catchId === sold.id)).toBe(false)
    expect(state.finance.cash).toBe(cashAfterSale)
    expect(state.finance.transactions.some((entry) => entry.kind === 'trade')).toBe(true)
  })

  it('keeps Trust, claimed rewards and known rumors across a reload (no re-claim)', async () => {
    const { repository, store, coordinator } = setup()
    await coordinator.start()

    const buyer = tokyoBuyer()
    const rewards: readonly ContactReward[] = [
      {
        id: asContactRewardId('test-rumor'),
        contactId: buyer.id,
        minTrust: 1,
        kind: 'intel',
        message: 'テストの噂',
      },
    ]
    // Trust 97 から 1 回売ると 100 に届く。claim は minTrust 到達で 1 度だけ。
    store.setState({ trade: { ...store.getState().trade, contactTrust: { 'test-izakaya': 97 } } })

    const first = keep(store, 'catch-trust-1')
    const sold = store.getState().sellToBuyer({
      buyer,
      catchIds: [first.id],
      tradeProfileBySpeciesId: tradeProfiles,
      rewards,
    })

    expect(sold.ok).toBe(true)
    if (!sold.ok) {
      return
    }

    expect(sold.newlyClaimedRewards.map((reward) => String(reward.id))).toEqual(['test-rumor'])
    expect(store.getState().trade.contactTrust['test-izakaya']).toBe(100)
    expect(sold.actualTrustGain).toBe(3)
    expect(store.getState().trade.claimedRewardIds).toEqual([asContactRewardId('test-rumor')])
    expect(store.getState().trade.knownRumorIds).toEqual([asContactRewardId('test-rumor')])

    await coordinator.flush()

    const reloaded = setup(repository.stored)
    await reloaded.coordinator.start()
    const reloadedState = reloaded.store.getState()

    expect(reloadedState.trade.contactTrust['test-izakaya']).toBe(100)
    expect(reloadedState.trade.claimedRewardIds).toEqual([asContactRewardId('test-rumor')])
    expect(reloadedState.trade.knownRumorIds).toEqual([asContactRewardId('test-rumor')])

    // reload 後にもう 1 匹売っても、同じ reward を再 claim しない。
    const second = keep(reloaded.store, 'catch-trust-2')
    const again = reloaded.store.getState().sellToBuyer({
      buyer,
      catchIds: [second.id],
      tradeProfileBySpeciesId: tradeProfiles,
      rewards,
    })

    expect(again.ok).toBe(true)
    if (!again.ok) {
      return
    }

    expect(again.newlyClaimedRewards).toEqual([])
    expect(reloadedState.trade.claimedRewardIds).toEqual([asContactRewardId('test-rumor')])
    // Trust 100 なので実際の増分は 0（UI も +0 を出す）。
    expect(again.actualTrustGain).toBe(0)
  })
})
