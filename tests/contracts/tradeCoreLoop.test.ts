import { describe, expect, it } from 'vitest'
import { loadContentFromDirectory } from '../../src/content/load/nodeContent'
import { evaluateAccess } from '../../src/domain/access/accessEngine'
import {
  createInitialTransportState,
  type PlayerTransportState,
} from '../../src/domain/access/Transport'
import { createInitialFinanceState } from '../../src/domain/economy'
import type { FishIndividual } from '../../src/domain/fish/FishIndividual'
import { asFishIndividualId, asRegionId } from '../../src/domain/ids'
import { emptyKnowledgeState } from '../../src/domain/knowledge/KnowledgeState'
import {
  quoteSale,
  sellCatches,
  toKeptCatch,
  createInitialTradeState,
} from '../../src/domain/trade'
import type { BuyerDefinition } from '../../src/domain/trade/Buyer'
import type { FishBoxState, KeptCatch } from '../../src/domain/trade/FishBox'
import type { SpeciesTradeProfile } from '../../src/domain/trade/SpeciesTradeProfile'
import type { TradeTag } from '../../src/domain/trade/TradeTag'
import {
  createInitialWorld,
  discoverSpotFromContact,
  isSpotKnown,
  leaveForSpot,
} from '../../src/domain/world/worldSession'
import type { FishingSpot } from '../../src/domain/world/FishingSpot'
import type { WorldTime } from '../../src/domain/world/WorldTime'
import { createPlayerStore } from '../../src/state/playerStore'

/**
 * Phase 13.1 — Core Loop（Fish Trade → Trust → Hidden Spot）の契約テスト。
 *
 * - Buyer の地域強制（Domain と Store の両方）
 * - Hidden Spot の discovery guard（UI 非表示だけを防壁にしない）
 * - quoteSale の不変条件（preview = 実売却 / line 合計 = total / 順序非依存）
 * - Trust の「実際に入った差分」
 * - Buyer 差は tradeTags × 好みで解決する（魚種 ID 分岐をしない）
 */

const content = loadContentFromDirectory()
const now: WorldTime = { year: 2026, month: 5, day: 2, hour: 7, minute: 0 }
const caughtAt: WorldTime = { year: 2026, month: 5, day: 2, hour: 6, minute: 0 }

const buyerById = (id: string): BuyerDefinition => {
  const buyer = content.buyerById[id]

  if (buyer === undefined) {
    throw new Error(`missing buyer ${id}`)
  }

  return buyer
}

const spotById = (id: string): FishingSpot => {
  const spot = content.spots.find((entry) => String(entry.id) === id)

  if (spot === undefined) {
    throw new Error(`missing spot ${id}`)
  }

  return spot
}

const firstTradableSpeciesOf = (spot: FishingSpot): string => {
  for (const occurrence of spot.fishTable) {
    const profile = content.speciesTradeProfileBySpeciesId[String(occurrence.speciesId)]

    if (profile !== undefined && profile.tradeStatus === 'tradable') {
      return String(occurrence.speciesId)
    }
  }

  throw new Error(`no tradable species in ${String(spot.id)}`)
}

const keepOf = (
  speciesId: string,
  spot: FishingSpot,
  overrides: Partial<KeptCatch> = {},
): KeptCatch => {
  const individual: FishIndividual = {
    id: asFishIndividualId(`${speciesId}#${String(overrides.catchId ?? 'one')}`),
    speciesId: speciesId as FishIndividual['speciesId'],
    lengthCm: 30,
    weightKg: 0.8,
    condition: 0.7,
    traits: [],
    fightSeed: 'seed',
    percentile: 70,
  }

  return {
    ...toKeptCatch({
      individual,
      caughtAt,
      sourceSpotId: spot.id,
      sourceRegionId: spot.regionId,
    }),
    ...overrides,
  }
}

const profileWithTags = (speciesId: string, tags: readonly TradeTag[]): SpeciesTradeProfile => ({
  speciesId: speciesId as SpeciesTradeProfile['speciesId'],
  tradeStatus: 'tradable',
  tradeTags: tags,
  baseYenPerKg: 1200,
  minimumUnitValueYen: 200,
  qualitySensitivity: 1,
  sizeSensitivity: 1,
})

describe('buyer region enforcement', () => {
  const tokyoSpot = spotById('tokyo-urban-canal')
  const speciesId = firstTradableSpeciesOf(tokyoSpot)
  const entry = keepOf(speciesId, tokyoSpot, { catchId: asFishIndividualId('region-1') })
  const profiles = {
    [speciesId]: content.speciesTradeProfileBySpeciesId[speciesId] as SpeciesTradeProfile,
  }

  it('sells to a Tokyo buyer while in Tokyo', () => {
    const result = sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyerById('local-izakaya'),
      currentRegionId: asRegionId('tokyo-area'),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now,
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a Tokyo buyer when the player is in Hokkaido (buyer_region_mismatch)', () => {
    const result = sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: buyerById('local-izakaya'),
      currentRegionId: asRegionId('hokkaido'),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.reason).toBe('buyer_region_mismatch')
  })

  it('rejects the same sale through the Store without moving cash or the Fish Box', () => {
    const store = createPlayerStore()
    store.getState().completeHydrationWithoutSave()
    const individual: FishIndividual = {
      id: entry.catchId,
      speciesId: entry.speciesId,
      lengthCm: entry.lengthCm,
      weightKg: entry.weightKg,
      condition: entry.condition,
      traits: [],
      fightSeed: 'seed',
      percentile: entry.percentile,
    }
    store.getState().keepCatch(individual, tokyoSpot)
    const cashBefore = store.getState().finance.cash

    // 遠征中（北海道）に東京の買取先へ売ろうとする。
    store.setState({
      world: { ...store.getState().world, currentRegionId: asRegionId('hokkaido') },
    })

    const result = store.getState().sellToBuyer({
      buyer: buyerById('local-izakaya'),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      rewards: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.reason).toBe('buyer_region_mismatch')
    expect(store.getState().finance.cash).toBe(cashBefore)
    expect(store.getState().trade.fishBox).toHaveLength(1)
  })

  it('has exactly the buyers of the current region (UI filtering rule)', () => {
    const tokyoBuyers = content.buyers.filter((buyer) => String(buyer.regionId) === 'tokyo-area')
    const hokkaidoBuyers = content.buyers.filter((buyer) => String(buyer.regionId) === 'hokkaido')

    expect(tokyoBuyers.length).toBeGreaterThan(0)
    // 北海道には今のところ買取先が無い（= Trade 画面は自然な空状態になる）。
    expect(hokkaidoBuyers).toEqual([])
  })
})

describe('hidden spot discovery guard', () => {
  const hiddenSpot = spotById('tokyo-hidden-canal-wall')
  const publicSpot = spotById('tokyo-urban-canal')
  const transports = content.transports
  const allTransports: PlayerTransportState = {
    availableTransportIds: transports.map((entry) => entry.id),
    ownedTransportIds: transports.map((entry) => entry.id),
  }
  const noTransports = createInitialTransportState((value) => value as never)
  const learned = {
    ...emptyKnowledgeState(),
    spots: Object.fromEntries(content.spots.map((entry) => [String(entry.id), 100])),
    regions: Object.fromEntries(content.regions.map((entry) => [String(entry.id), 100])),
  }

  it('A: refuses to travel to an undiscovered hidden spot even with every transport', () => {
    const world = { ...createInitialWorld(), currentRegionId: hiddenSpot.regionId }

    expect(isSpotKnown(world, hiddenSpot)).toBe(false)

    const result = leaveForSpot({
      context: { world, knowledge: learned },
      spot: hiddenSpot,
      transports,
      playerTransports: allTransports,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.reason).toBe('undiscovered')
  })

  it('B: refuses a discovered hidden spot when access is missing (Access is separate)', () => {
    // road_access が要る Hidden Spot。徒歩のみの初期状態では行けない。
    const roadHidden = spotById('tokyo-hidden-rocky-cove')
    const world = discoverSpotFromContact(
      { ...createInitialWorld(), currentRegionId: roadHidden.regionId },
      roadHidden.id,
    )
    const access = evaluateAccess({
      spot: roadHidden,
      transports,
      playerTransports: noTransports,
      knowledge: learned,
      permitsEnabled: true,
    })

    expect(access.accessible).toBe(false)

    const result = leaveForSpot({
      context: { world, knowledge: learned },
      spot: roadHidden,
      transports,
      playerTransports: noTransports,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.reason).toBe('inaccessible')
  })

  it('C: travels to a discovered hidden spot when access is satisfied', () => {
    const world = discoverSpotFromContact(
      { ...createInitialWorld(), currentRegionId: hiddenSpot.regionId },
      hiddenSpot.id,
    )

    expect(isSpotKnown(world, hiddenSpot)).toBe(true)

    const result = leaveForSpot({
      context: { world, knowledge: learned },
      spot: hiddenSpot,
      transports,
      playerTransports: allTransports,
    })

    expect(result.ok).toBe(true)
  })

  it('D: public spots keep working without any discovery step', () => {
    const world = createInitialWorld()
    const result = leaveForSpot({
      context: { world, knowledge: learned },
      spot: publicSpot,
      transports,
      playerTransports: allTransports,
    })

    expect(result.ok).toBe(true)
  })

  it('refuses the Store-level travel before charging the fare', () => {
    const store = createPlayerStore()
    store.getState().completeHydrationWithoutSave()
    const cashBefore = store.getState().finance.cash

    const result = store.getState().travelToSpot(hiddenSpot, content.transports)

    expect(result.ok).toBe(false)
    expect(store.getState().finance.cash).toBe(cashBefore)
    expect(store.getState().world.phase).toBe('HOME')
  })
})

describe('quoteSale invariants', () => {
  const spot = spotById('tokyo-urban-canal')
  const speciesId = firstTradableSpeciesOf(spot)
  const profile = profileWithTags(speciesId, ['everyday', 'oily', 'bulk'])
  const profiles = { [speciesId]: profile }
  const untradableId = 'untradable-species'
  const profilesWithUntradable = {
    ...profiles,
    [untradableId]: {
      ...profile,
      speciesId: untradableId as SpeciesTradeProfile['speciesId'],
      tradeStatus: 'non_tradable' as const,
    },
  }

  const box: FishBoxState = [
    keepOf(speciesId, spot, { catchId: asFishIndividualId('a'), weightKg: 0.4 }),
    keepOf(speciesId, spot, { catchId: asFishIndividualId('b'), weightKg: 1.4 }),
    keepOf(speciesId, spot, { catchId: asFishIndividualId('c'), weightKg: 2.6 }),
  ]
  const untradable = keepOf(untradableId, spot, { catchId: asFishIndividualId('u') })
  const wholesaler = buyerById('fish-wholesaler')

  it('keeps sum(lines.valueYen) === totalValueYen', () => {
    const quote = quoteSale({
      fishBox: box,
      catchIds: box.map((entry) => entry.catchId),
      buyer: wholesaler,
      tradeProfileBySpeciesId: profiles,
      now,
    })

    expect(quote.lines.reduce((sum, line) => sum + line.valueYen, 0)).toBe(quote.totalValueYen)
    expect(quote.volumeBonus).toBeGreaterThan(0)
  })

  it('does not change the volume bonus when a non-tradable fish is inserted anywhere', () => {
    const base = quoteSale({
      fishBox: box,
      catchIds: box.map((entry) => entry.catchId),
      buyer: wholesaler,
      tradeProfileBySpeciesId: profilesWithUntradable,
      now,
    })
    const untradableFirst = quoteSale({
      fishBox: [untradable, ...box],
      catchIds: [untradable.catchId, ...box.map((entry) => entry.catchId)],
      buyer: wholesaler,
      tradeProfileBySpeciesId: profilesWithUntradable,
      now,
    })
    const untradableMiddle = quoteSale({
      fishBox: [box[0]!, untradable, box[1]!, box[2]!],
      catchIds: [box[0]!.catchId, untradable.catchId, box[1]!.catchId, box[2]!.catchId],
      buyer: wholesaler,
      tradeProfileBySpeciesId: profilesWithUntradable,
      now,
    })

    expect(untradableFirst.volumeBonus).toBe(base.volumeBonus)
    expect(untradableMiddle.volumeBonus).toBe(base.volumeBonus)
    expect(untradableFirst.totalValueYen).toBe(base.totalValueYen)
    expect(untradableMiddle.totalValueYen).toBe(base.totalValueYen)
    expect(untradableFirst.excluded.map((entry) => String(entry.catchId))).toEqual(['u'])
  })

  it('does not change the total when the catch order changes', () => {
    const forward = quoteSale({
      fishBox: box,
      catchIds: box.map((entry) => entry.catchId),
      buyer: wholesaler,
      tradeProfileBySpeciesId: profiles,
      now,
    })
    const backward = quoteSale({
      fishBox: [...box].reverse(),
      catchIds: [...box].reverse().map((entry) => entry.catchId),
      buyer: wholesaler,
      tradeProfileBySpeciesId: profiles,
      now,
    })

    expect(backward.totalValueYen).toBe(forward.totalValueYen)
    expect(backward.lines.map((line) => line.valueYen).sort()).toEqual(
      forward.lines.map((line) => line.valueYen).sort(),
    )
  })

  it('matches the amount actually paid by sellCatches', () => {
    const quote = quoteSale({
      fishBox: box,
      catchIds: box.map((entry) => entry.catchId),
      buyer: wholesaler,
      tradeProfileBySpeciesId: profiles,
      now,
    })
    const sale = sellCatches({
      fishBox: box,
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: wholesaler,
      currentRegionId: spot.regionId,
      catchIds: box.map((entry) => entry.catchId),
      tradeProfileBySpeciesId: profiles,
      now,
    })

    expect(sale.ok).toBe(true)
    if (!sale.ok) {
      return
    }

    expect(sale.totalValueYen).toBe(quote.totalValueYen)
    expect(sale.finance.cash).toBe(createInitialFinanceState().cash + quote.totalValueYen)
  })
})

describe('trust actual gain', () => {
  const spot = spotById('tokyo-urban-canal')
  const speciesId = firstTradableSpeciesOf(spot)
  const entry = keepOf(speciesId, spot, { catchId: asFishIndividualId('trust-1') })
  const profiles = {
    [speciesId]: content.speciesTradeProfileBySpeciesId[speciesId] as SpeciesTradeProfile,
  }
  const izakaya = buyerById('local-izakaya')

  const saleAt = (trust: number) =>
    sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: { ...createInitialTradeState(), contactTrust: { [String(izakaya.id)]: trust } },
      buyer: izakaya,
      currentRegionId: spot.regionId,
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: profiles,
      now,
    })

  it('reports the gain that actually lands in state at Trust 98', () => {
    const result = saleAt(98)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.trustBefore).toBe(98)
    expect(result.trustAfter).toBe(100)
    expect(result.actualTrustGain).toBe(2)
    expect(result.trade.contactTrust[String(izakaya.id)]).toBe(100)
  })

  it('reports +0 at Trust 100 instead of the calculated gain', () => {
    const result = saleAt(100)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.actualTrustGain).toBe(0)
    expect(result.trade.contactTrust[String(izakaya.id)]).toBe(100)
  })
})

describe('buyer differentiation through tradeTags', () => {
  const spot = spotById('tokyo-urban-canal')
  const speciesId = firstTradableSpeciesOf(spot)
  const izakaya = buyerById('local-izakaya')
  const wholesaler = buyerById('fish-wholesaler')
  const market = buyerById('market-broker')

  /*
   * quality / size を中立（condition 0.5 / percentile 50）に固定して、
   * 「タグの好み」だけの差を見る（買取先の感度は別の軸で検証済み）。
   */
  const value = (tags: readonly TradeTag[], buyer: BuyerDefinition): number =>
    quoteSale({
      fishBox: [
        keepOf(speciesId, spot, {
          catchId: asFishIndividualId('affinity-1'),
          weightKg: 1,
          condition: 0.5,
          percentile: 50,
        }),
      ],
      catchIds: [asFishIndividualId('affinity-1')],
      buyer,
      tradeProfileBySpeciesId: { [speciesId]: profileWithTags(speciesId, tags) },
      now,
    }).totalValueYen

  it('prefers table fish at the izakaya and premium large fish at the market', () => {
    const tableFish = ['small_table_fish', 'white_fish'] as const
    const trophyFish = ['premium', 'large_fish'] as const

    expect(value(tableFish, izakaya)).toBeGreaterThan(value(tableFish, market))
    expect(value(trophyFish, market)).toBeGreaterThan(value(trophyFish, izakaya))
  })

  it('lets the wholesaler win a bulk bundle that the market discounts', () => {
    const bulk = ['bulk', 'everyday', 'oily'] as const
    const bundle: FishBoxState = [0, 1, 2, 3, 4].map((index) =>
      keepOf(speciesId, spot, {
        catchId: asFishIndividualId(`bulk-${String(index)}`),
        weightKg: 1,
        condition: 0.5,
        percentile: 50,
      }),
    )
    const totalFor = (buyer: BuyerDefinition) =>
      quoteSale({
        fishBox: bundle,
        catchIds: bundle.map((entry) => entry.catchId),
        buyer,
        tradeProfileBySpeciesId: { [speciesId]: profileWithTags(speciesId, bulk) },
        now,
      }).totalValueYen

    expect(totalFor(wholesaler)).toBeGreaterThan(totalFor(market))
  })

  it('pays a local-source bonus only when the catch region matches the buyer region', () => {
    const local = keepOf(speciesId, spot, { catchId: asFishIndividualId('local-1') })
    const foreign = { ...local, sourceRegionId: asRegionId('hokkaido') }
    const profiles = { [speciesId]: profileWithTags(speciesId, ['everyday']) }
    const priceOf = (entry: KeptCatch) =>
      quoteSale({
        fishBox: [entry],
        catchIds: [entry.catchId],
        buyer: izakaya,
        tradeProfileBySpeciesId: profiles,
        now,
      }).totalValueYen

    expect(priceOf(local)).toBeGreaterThan(priceOf(foreign))
  })
})

describe('fish box state stays consistent in the store', () => {
  it('removes the sold catch from the persisted trade state', () => {
    const store = createPlayerStore()
    store.getState().completeHydrationWithoutSave()
    const spot = spotById('tokyo-urban-canal')
    const speciesId = firstTradableSpeciesOf(spot)
    const entry = keepOf(speciesId, spot, { catchId: asFishIndividualId('store-1') })
    const individual: FishIndividual = {
      id: entry.catchId,
      speciesId: entry.speciesId,
      lengthCm: entry.lengthCm,
      weightKg: entry.weightKg,
      condition: entry.condition,
      traits: [],
      fightSeed: 'seed',
      percentile: entry.percentile,
    }

    store.getState().keepCatch(individual, spot)
    expect(store.getState().trade.fishBox).toHaveLength(1)

    const result = store.getState().sellToBuyer({
      buyer: buyerById('local-izakaya'),
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: {
        [speciesId]: content.speciesTradeProfileBySpeciesId[speciesId] as SpeciesTradeProfile,
      },
      rewards: [],
    })

    expect(result.ok).toBe(true)
    // 売った魚が trade.fishBox から消えている（消えていないと二重売却できる）。
    expect(store.getState().trade.fishBox).toEqual([])
    expect(store.getState().finance.transactions[0]?.kind).toBe('trade')
  })
})
