import { describe, expect, it } from 'vitest'
import {
  asContactId,
  asContactRewardId,
  asFishIndividualId,
  asFishSpeciesId,
  asFishingSpotId,
  asRegionId,
} from '../ids'
import { createInitialFinanceState } from '../economy'
import type { WorldTime } from '../world/WorldTime'
import { addKeptCatch, removeKeptCatches, type KeptCatch } from './FishBox'
import { DEFAULT_STORAGE_MODIFIER, FRESHNESS_FLOOR, resolveFreshness } from './Freshness'
import type { BuyerDefinition } from './Buyer'
import type { SpeciesTradeProfile } from './SpeciesTradeProfile'
import { calcSaleValueYen } from './tradeValue'
import { sellCatches } from './sellCatches'
import { createInitialTradeState } from './TradeState'
import { claimEligibleRewards } from './rewardClaim'
import type { ContactReward } from './ContactReward'

const time = (hour: number, minute = 0): WorldTime => ({
  year: 2026,
  month: 5,
  day: 1,
  hour,
  minute,
})

const catchOf = (overrides: Partial<KeptCatch> = {}): KeptCatch => ({
  catchId: asFishIndividualId('fish-1'),
  speciesId: asFishSpeciesId('test-species'),
  lengthCm: 40,
  weightKg: 1.2,
  condition: 0.6,
  percentile: 60,
  traits: [],
  caughtAt: time(6),
  sourceSpotId: asFishingSpotId('test-spot'),
  sourceRegionId: asRegionId('tokyo-area'),
  ...overrides,
})

const buyer = (overrides: Partial<BuyerDefinition> = {}): BuyerDefinition => ({
  id: asContactId('test-buyer'),
  name: 'Test Buyer',
  buyerType: 'izakaya',
  regionId: asRegionId('tokyo-area'),
  description: 'test',
  pricingProfile: {
    baseMultiplier: 1,
    qualitySensitivity: 1,
    sizeSensitivity: 1,
    freshnessSensitivity: 0.5,
    volumeBonusPerExtraCatch: 0,
    maxVolumeBonus: 0,
  },
  trustProfile: {
    perTransactionBase: 2,
    qualityWeight: 6,
    maxPerTransaction: 6,
  },
  ...overrides,
})

const tradableProfile = (overrides: Partial<SpeciesTradeProfile> = {}): SpeciesTradeProfile => ({
  speciesId: asFishSpeciesId('test-species'),
  tradeStatus: 'tradable',
  baseYenPerKg: 1000,
  minimumUnitValueYen: 100,
  qualitySensitivity: 1,
  sizeSensitivity: 1,
  ...overrides,
})

describe('FishBox', () => {
  it('does not add the same catch twice', () => {
    const entry = catchOf()
    const once = addKeptCatch([], entry)
    const twice = addKeptCatch(once, entry)

    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
    expect(twice).toBe(once)
  })

  it('removes only the requested catches', () => {
    const a = catchOf({ catchId: asFishIndividualId('a') })
    const b = catchOf({ catchId: asFishIndividualId('b') })
    const box = addKeptCatch(addKeptCatch([], a), b)

    const removed = removeKeptCatches(box, [asFishIndividualId('a')])

    expect(removed.map((entry) => String(entry.catchId))).toEqual(['b'])
  })
})

describe('resolveFreshness', () => {
  it('stays at 1 right after landing', () => {
    expect(resolveFreshness(time(6), time(6))).toBe(1)
  })

  it('decays over time but never drops below the floor', () => {
    const freshAfterOneHour = resolveFreshness(time(6), time(7))
    const freshAfterTenDays = resolveFreshness(time(6), { ...time(6), day: 11 })

    expect(freshAfterOneHour).toBeLessThan(1)
    expect(freshAfterTenDays).toBe(FRESHNESS_FLOOR)
  })

  it('storage modifier slows decay', () => {
    const normal = resolveFreshness(time(6), time(18), DEFAULT_STORAGE_MODIFIER)
    const slower = resolveFreshness(time(6), time(18), 0.5)

    expect(slower).toBeGreaterThan(normal)
  })
})

describe('calcSaleValueYen', () => {
  it('is deterministic for the same inputs', () => {
    const a = calcSaleValueYen(catchOf(), buyer(), tradableProfile(), 1)
    const b = calcSaleValueYen(catchOf(), buyer(), tradableProfile(), 1)

    expect(a).toBe(b)
  })

  it('is zero for a non-tradable species', () => {
    expect(
      calcSaleValueYen(catchOf(), buyer(), tradableProfile({ tradeStatus: 'unpriced' }), 1),
    ).toBe(0)
  })

  it('rewards better condition and size with a higher price', () => {
    const poor = calcSaleValueYen(
      catchOf({ condition: 0.2, percentile: 10 }),
      buyer(),
      tradableProfile(),
      1,
    )
    const excellent = calcSaleValueYen(
      catchOf({ condition: 0.95, percentile: 95 }),
      buyer(),
      tradableProfile(),
      1,
    )

    expect(excellent).toBeGreaterThan(poor)
  })

  it('never goes below the minimum unit value', () => {
    const tiny = catchOf({ weightKg: 0.001, condition: 0, percentile: 0 })
    const value = calcSaleValueYen(tiny, buyer(), tradableProfile({ minimumUnitValueYen: 250 }), 1)

    expect(value).toBeGreaterThanOrEqual(250)
  })
})

describe('sellCatches', () => {
  const profiles = { 'test-species': tradableProfile() }

  it('removes sold catches from the Fish Box, pays cash, and grows trust', () => {
    const entry = catchOf()
    const result = sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyer(),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now: time(6),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.fishBox).toEqual([])
    expect(result.finance.cash).toBeGreaterThan(createInitialFinanceState().cash)
    expect(result.finance.transactions[0]?.kind).toBe('trade')
    expect(result.trustGain).toBeGreaterThan(0)
    expect(result.trade.contactTrust[String(buyer().id)]).toBe(result.trustGain)
  })

  it('cannot sell the same catch twice (it is gone from the box)', () => {
    const entry = catchOf()
    const first = sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyer(),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now: time(6),
    })

    expect(first.ok).toBe(true)
    if (!first.ok) {
      return
    }

    const second = sellCatches({
      fishBox: first.fishBox,
      finance: first.finance,
      trade: first.trade,
      buyer: buyer(),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now: time(7),
    })

    expect(second.ok).toBe(false)
  })

  it('excludes non-tradable species instead of failing the whole sale', () => {
    const tradable = catchOf({ catchId: asFishIndividualId('a') })
    const nonTradable = catchOf({
      catchId: asFishIndividualId('b'),
      speciesId: asFishSpeciesId('untradable-species'),
    })
    const result = sellCatches({
      fishBox: [tradable, nonTradable],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyer(),
      catchIds: [tradable.catchId, nonTradable.catchId],
      tradeProfileBySpeciesId: {
        ...profiles,
        'untradable-species': tradableProfile({
          speciesId: asFishSpeciesId('untradable-species'),
          tradeStatus: 'non_tradable',
        }),
      },
      now: time(6),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.excludedCatchIds).toEqual([nonTradable.catchId])
    expect(result.fishBox).toEqual([nonTradable])
  })

  it('caps trust gain at the buyer maxPerTransaction regardless of catch quality', () => {
    const trophy = catchOf({ condition: 1, percentile: 100 })
    const result = sellCatches({
      fishBox: [trophy],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyer({
        trustProfile: { perTransactionBase: 90, qualityWeight: 50, maxPerTransaction: 6 },
      }),
      catchIds: [trophy.catchId],
      tradeProfileBySpeciesId: profiles,
      now: time(6),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.trustGain).toBe(6)
  })

  it('does not sell trust to 100 in a single big-fish transaction', () => {
    const trophy = catchOf({ condition: 1, percentile: 100 })
    const result = sellCatches({
      fishBox: [trophy],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyer(),
      catchIds: [trophy.catchId],
      tradeProfileBySpeciesId: profiles,
      now: time(6),
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.trade.contactTrust[String(buyer().id)]).toBeLessThan(100)
    }
  })
})

describe('claimEligibleRewards', () => {
  const contactId = asContactId('test-buyer')
  const rewards: readonly ContactReward[] = [
    { id: asContactRewardId('r10'), contactId, minTrust: 10, kind: 'intel', message: 'rumor' },
    {
      id: asContactRewardId('r25'),
      contactId,
      minTrust: 25,
      kind: 'discover_spot',
      message: 'spot',
      targetId: asFishingSpotId('hidden-spot'),
    },
  ]

  it('grants nothing just below the threshold', () => {
    const trade = { ...createInitialTradeState(), contactTrust: { [String(contactId)]: 9 } }
    const result = claimEligibleRewards(trade, contactId, rewards)

    expect(result.newlyClaimed).toEqual([])
  })

  it('grants a reward exactly once when the threshold is reached', () => {
    const trade = { ...createInitialTradeState(), contactTrust: { [String(contactId)]: 10 } }
    const first = claimEligibleRewards(trade, contactId, rewards)

    expect(first.newlyClaimed.map((reward) => String(reward.id))).toEqual(['r10'])

    const second = claimEligibleRewards(first.trade, contactId, rewards)
    expect(second.newlyClaimed).toEqual([])
  })

  it('does not re-grant a claimed reward after a big trust jump', () => {
    const claimed = claimEligibleRewards(
      { ...createInitialTradeState(), contactTrust: { [String(contactId)]: 10 } },
      contactId,
      rewards,
    ).trade

    const jumped = claimEligibleRewards(
      { ...claimed, contactTrust: { [String(contactId)]: 100 } },
      contactId,
      rewards,
    )

    expect(jumped.newlyClaimed.map((reward) => String(reward.id))).toEqual(['r25'])
  })

  it('survives a save/load round-trip by relying only on claimedRewardIds', () => {
    const afterFirst = claimEligibleRewards(
      { ...createInitialTradeState(), contactTrust: { [String(contactId)]: 30 } },
      contactId,
      rewards,
    ).trade

    // Save/load を模す: 同じ claimedRewardIds を持つ別オブジェクトから再評価する。
    const reloaded = { ...afterFirst }
    const result = claimEligibleRewards(reloaded, contactId, rewards)

    expect(result.newlyClaimed).toEqual([])
  })
})
