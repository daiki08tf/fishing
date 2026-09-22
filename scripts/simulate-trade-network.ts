import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { evaluateAccess } from '../src/domain/access/accessEngine'
import type { PlayerTransportState } from '../src/domain/access/Transport'
import type { TransportDefinition } from '../src/domain/access/Transport'
import { createInitialFinanceState } from '../src/domain/economy'
import { defaultTravelOption, roundTripCostFor } from '../src/domain/economy/travelCost'
import type { EncounterCandidate } from '../src/domain/encounter/encounterEngine'
import { FishingEngine, isTerminalPhase, type FishingEvent } from '../src/domain/fishing'
import { generateFishIndividual } from '../src/domain/fish/generateFishIndividual'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { asFishIndividualId, asRegionId } from '../src/domain/ids'
import { emptyKnowledgeState } from '../src/domain/knowledge/KnowledgeState'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'
import {
  addKeptCatch,
  claimEligibleRewards,
  createInitialTradeState,
  quoteSale,
  sellCatches,
  toKeptCatch,
  TRADE_TAGS,
  type KeptCatch,
  type TradeTag,
} from '../src/domain/trade'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import type { WorldTime } from '../src/domain/world/WorldTime'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  discoverSpotFromContact,
  isSpotKnown,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
} from '../src/domain/world/worldSession'
import { migrateV8ToV9 } from '../src/infrastructure/persistence/migrateSave'
import { createValidSaveV8 } from '../tests/fixtures/save'
import { chooseCommand } from './simulate-fishing'

/**
 * Fish Trade / Contacts / Hidden Spot の 1 本通し（Phase 13.1）。
 *
 * 実 Content（buyers / species-trade-profiles / contact-rewards / fishing-spots）を
 * 読み込み、Keep/Release → Fish Box → Sell → Trust → Reward → Hidden Spot discovery →
 * discovery guard → Access までの Core Loop を検証する。
 *
 * バランス確認（simulateTradeTrips）は「1 trial = 1 匹の売却」ではなく、
 * 1 trial = 1 釣行（移動 → 釣り xN → Keep → 帰宅 → 売却）の deterministic な
 * モデルで行う。既存 FishingEngine をそのまま使う。
 *
 * seed 固定。PASS / FAIL を出し、同じ入力からは同じ結果になる。
 */

export type TradeSimulationCheck = {
  readonly label: string
  readonly ok: boolean
}

export type TradeSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly TradeSimulationCheck[]
}

const at = (overrides: Partial<WorldTime> = {}): WorldTime => ({
  ...createInitialWorld().time,
  ...overrides,
})

const fullTransportState = (transports: readonly TransportDefinition[]): PlayerTransportState => ({
  availableTransportIds: transports.map((entry) => entry.id),
  ownedTransportIds: transports.map((entry) => entry.id),
})

export const simulateTradeNetwork = (): TradeSimulationResult => {
  const content = loadContentFromDirectory()
  const checks: TradeSimulationCheck[] = []
  const lines: string[] = []
  const push = (label: string, ok: boolean): void => {
    checks.push({ label, ok })
  }

  const speciesById = content.speciesById
  const spot = content.spots.find(
    (candidate) =>
      String(candidate.regionId) === 'tokyo-area' &&
      candidate.visibility !== 'hidden' &&
      candidate.fishTable.length > 0,
  )
  const buyers = content.buyers
  const izakaya = buyers.find((entry) => entry.buyerType === 'izakaya')
  const wholesaler = buyers.find((entry) => entry.buyerType === 'wholesaler')
  const market = buyers.find((entry) => entry.buyerType === 'market')

  if (
    spot === undefined ||
    izakaya === undefined ||
    wholesaler === undefined ||
    market === undefined
  ) {
    lines.push('ERROR: missing baseline content (spot / 3 buyer types)')
    return { exitCode: 1, lines, checks: [] }
  }

  const regionId = asRegionId('tokyo-area')
  const occurrence = spot.fishTable[0]
  const species: FishSpecies | undefined =
    occurrence === undefined ? undefined : speciesById[String(occurrence.speciesId)]
  const profile =
    species === undefined ? undefined : content.speciesTradeProfileBySpeciesId[String(species.id)]

  if (species === undefined || profile === undefined) {
    lines.push('ERROR: baseline spot species has no species-trade-profiles entry')
    return { exitCode: 1, lines, checks: [] }
  }

  const random = new SeededRandomSource('trade-network-demo')
  const landedAt = at({ hour: 6 })

  const land = (seed: string) =>
    generateFishIndividual({ species, random, individualSeed: seed, spotId: spot.id })
  const entryOf = (seed: string): KeptCatch =>
    toKeptCatch({
      individual: land(seed).individual,
      caughtAt: landedAt,
      sourceSpotId: spot.id,
      sourceRegionId: spot.regionId,
    })

  // 1. Keep / Release は Fish Box への追加だけを左右する。
  const kept = entryOf('keep-1')
  const released = entryOf('release-1')
  let fishBox = addKeptCatch([], kept)
  push('Keep した個体だけが Fish Box に 1 匹入る', fishBox.length === 1)
  push(
    'Release した個体は Fish Box に入らない',
    !fishBox.some((entry) => String(entry.catchId) === String(released.catchId)),
  )
  fishBox = addKeptCatch(fishBox, kept)
  push('同じ catch を 2 回 Keep しても Fish Box は 1 匹のまま', fishBox.length === 1)

  // 2. 売却: Fish Box から消え、Finance が増え、transaction が追加され、Trust が増える。
  const tradeProfiles = { [String(species.id)]: profile }
  const izakayaSale = sellCatches({
    fishBox,
    finance: createInitialFinanceState(),
    trade: createInitialTradeState(),
    buyer: izakaya,
    currentRegionId: regionId,
    catchIds: [kept.catchId],
    tradeProfileBySpeciesId: tradeProfiles,
    now: at({ hour: 7 }),
  })
  push('売却後 Fish Box から消える', izakayaSale.ok && izakayaSale.fishBox.length === 0)
  push(
    '売却後 Finance の cash が増える',
    izakayaSale.ok && izakayaSale.finance.cash > createInitialFinanceState().cash,
  )
  push(
    '売却後 transaction が追加される（kind: trade）',
    izakayaSale.ok && izakayaSale.finance.transactions[0]?.kind === 'trade',
  )
  push('売却後 Buyer Trust が増える', izakayaSale.ok && izakayaSale.actualTrustGain > 0)

  // 3. Buyer 地域の強制（Phase 13.1）。Domain 側で拒否する。
  const crossRegion = sellCatches({
    fishBox,
    finance: createInitialFinanceState(),
    trade: createInitialTradeState(),
    buyer: izakaya,
    // 北海道にいるのに東京の Buyer へ売ろうとする。
    currentRegionId: asRegionId('hokkaido'),
    catchIds: [kept.catchId],
    tradeProfileBySpeciesId: tradeProfiles,
    now: at({ hour: 7 }),
  })
  push(
    '現在地域と Buyer の地域が違えば buyer_region_mismatch で拒否する',
    !crossRegion.ok && crossRegion.reason === 'buyer_region_mismatch',
  )
  push('現在地域に Buyer がいる場合は売れる（Tokyo / Tokyo Buyer）', izakayaSale.ok)

  // 4. 同じ catch は 1 回しか売れない。
  if (izakayaSale.ok) {
    const resell = sellCatches({
      fishBox: izakayaSale.fishBox,
      finance: izakayaSale.finance,
      trade: izakayaSale.trade,
      buyer: izakaya,
      currentRegionId: regionId,
      catchIds: [kept.catchId],
      tradeProfileBySpeciesId: tradeProfiles,
      now: at({ hour: 8 }),
    })
    push('同じ catch を 2 回売れない', !resell.ok)
  } else {
    push('同じ catch を 2 回売れない', false)
  }

  // 5. Trust threshold 直前は reward なし、到達で 1 度だけ。
  const rewardsForIzakaya = content.contactRewards.filter(
    (reward) => String(reward.contactId) === String(izakaya.id),
  )
  const lowestReward = [...rewardsForIzakaya].sort(
    (left, right) => left.minTrust - right.minTrust,
  )[0]

  if (lowestReward !== undefined) {
    const justBelow = claimEligibleRewards(
      {
        ...createInitialTradeState(),
        contactTrust: { [String(izakaya.id)]: lowestReward.minTrust - 1 },
      },
      izakaya.id,
      rewardsForIzakaya,
    )
    const atThreshold = claimEligibleRewards(
      {
        ...createInitialTradeState(),
        contactTrust: { [String(izakaya.id)]: lowestReward.minTrust },
      },
      izakaya.id,
      rewardsForIzakaya,
    )
    const claimedAgain = claimEligibleRewards(atThreshold.trade, izakaya.id, rewardsForIzakaya)

    push('Trust threshold 直前は reward なし', justBelow.newlyClaimed.length === 0)
    push(
      'Trust threshold 到達で reward が 1 度だけ付与される',
      atThreshold.newlyClaimed.length === 1,
    )
    push('同じ reward を再取得しない', claimedAgain.newlyClaimed.length === 0)
  } else {
    push('Trust threshold 直前は reward なし', false)
    push('Trust threshold 到達で reward が 1 度だけ付与される', false)
    push('同じ reward を再取得しない', false)
  }

  // 6. Save/load しても reward が二重付与されない（v8 → v9 migration 経由）。
  const v8 = createValidSaveV8()
  const migrated = migrateV8ToV9(v8)
  const afterFirstSell = izakayaSale.ok ? izakayaSale.trade : createInitialTradeState()
  const reloaded = { ...migrated.trade, ...afterFirstSell }
  const reclaimed = claimEligibleRewards(reloaded, izakaya.id, rewardsForIzakaya)
  push(
    'v8 → v9 migration は既存データを保持しつつ空の trade ブロックを作る',
    migrated.schemaVersion === 9 && migrated.trade.fishBox.length === 0,
  )
  push(
    'Save/load 後も claimedRewardIds に基づき reward が重複付与されない',
    reclaimed.newlyClaimed.every((reward) => !reloaded.claimedRewardIds.includes(reward.id)),
  )

  // 7. Trust は計算値ではなく「実際に入った差分」を返す（Trust 100 で +0）。
  const entryAt = (trust: number) =>
    sellCatches({
      fishBox: [kept],
      finance: createInitialFinanceState(),
      trade: { ...createInitialTradeState(), contactTrust: { [String(izakaya.id)]: trust } },
      buyer: izakaya,
      currentRegionId: regionId,
      catchIds: [kept.catchId],
      tradeProfileBySpeciesId: tradeProfiles,
      now: at({ hour: 7 }),
    })
  const nearCap = entryAt(98)
  push(
    'Trust 98 からの売却は actualTrustGain = 2（100 で頭打ち）',
    nearCap.ok && nearCap.actualTrustGain === 2 && nearCap.trustAfter === 100,
  )
  const atCap = entryAt(100)
  push('Trust 100 の売却は actualTrustGain = 0', atCap.ok && atCap.actualTrustGain === 0)

  // 8. quoteSale: line 合計 = total、並び順に依存しない、実売却と一致する。
  const pair: readonly KeptCatch[] = [kept, released]
  const quote = quoteSale({
    fishBox: pair,
    catchIds: pair.map((entry) => entry.catchId),
    buyer: wholesaler,
    tradeProfileBySpeciesId: tradeProfiles,
    now: at({ hour: 7 }),
  })
  push(
    'quoteSale: sum(lines.valueYen) === totalValueYen',
    quote.lines.reduce((sum, line) => sum + line.valueYen, 0) === quote.totalValueYen,
  )
  const reordered = quoteSale({
    fishBox: [...pair].reverse(),
    catchIds: [...pair].reverse().map((entry) => entry.catchId),
    buyer: wholesaler,
    tradeProfileBySpeciesId: tradeProfiles,
    now: at({ hour: 7 }),
  })
  push('quoteSale: 並び順を変えても合計は同じ', reordered.totalValueYen === quote.totalValueYen)

  const quoteActual = sellCatches({
    fishBox: pair,
    finance: createInitialFinanceState(),
    trade: createInitialTradeState(),
    buyer: wholesaler,
    currentRegionId: regionId,
    catchIds: pair.map((entry) => entry.catchId),
    tradeProfileBySpeciesId: tradeProfiles,
    now: at({ hour: 7 }),
  })
  push(
    'Trade preview（quoteSale）と実際の受け取り額が一致する',
    quoteActual.ok && quoteActual.totalValueYen === quote.totalValueYen,
  )
  push(
    'まとめ売りで volume bonus が掛かる（卸）',
    quote.volumeBonus > 0 && quote.lines.some((line) => line.valueYen > line.baseValueYen),
  )

  // 9. 取引不可の魚が混ざっても、その「位置」で volume bonus は変わらない。
  const untradable: KeptCatch = {
    ...kept,
    catchId: asFishIndividualId('untradable-catch'),
    speciesId: 'untradable-species' as KeptCatch['speciesId'],
  }
  const withUntradableFirst = quoteSale({
    fishBox: [untradable, ...pair],
    catchIds: [untradable.catchId, ...pair.map((entry) => entry.catchId)],
    buyer: wholesaler,
    tradeProfileBySpeciesId: {
      ...tradeProfiles,
      'untradable-species': {
        ...profile,
        speciesId: 'untradable-species' as typeof profile.speciesId,
        tradeStatus: 'non_tradable',
      },
    },
    now: at({ hour: 7 }),
  })
  push(
    '取引不可の魚が前に混ざっても volume bonus と合計は変わらない',
    withUntradableFirst.totalValueYen === quote.totalValueYen &&
      withUntradableFirst.volumeBonus === quote.volumeBonus &&
      withUntradableFirst.excluded.length === 1,
  )

  // 10. Buyer 差は魚種 ID ではなく tradeTags × 好みで解決する。
  const trophy: KeptCatch = {
    ...kept,
    condition: 0.95,
    percentile: 97,
    weightKg: kept.weightKg * 5,
  }
  const trophyProfiles = {
    [String(kept.speciesId)]: { ...profile, tradeTags: ['premium', 'large_fish'] as TradeTag[] },
  }
  const izakayaTrophy = quoteSale({
    fishBox: [trophy],
    catchIds: [trophy.catchId],
    buyer: izakaya,
    tradeProfileBySpeciesId: trophyProfiles,
    now: at({ hour: 7 }),
  }).totalValueYen
  const marketTrophy = quoteSale({
    fishBox: [trophy],
    catchIds: [trophy.catchId],
    buyer: market,
    tradeProfileBySpeciesId: trophyProfiles,
    now: at({ hour: 7 }),
  }).totalValueYen
  push(
    'market は premium / large_fish を izakaya より高く評価する（tag affinity）',
    marketTrophy > izakayaTrophy,
  )

  // 11. Hidden Spot: discovery（知っているか）と access（行けるか）を分離したまま、
  //     未発見の場所への移動を Domain で拒否する。
  const hiddenSpot = content.spots.find((candidate) => candidate.visibility === 'hidden')

  if (hiddenSpot !== undefined) {
    const transports = content.transports
    const playerTransports = fullTransportState(transports)
    const hiddenPermits = hiddenSpot.access.flatMap((requirement) =>
      requirement.kind === 'permit' ? [String(requirement.permitId)] : [],
    )
    const hiddenKnowledge = {
      ...emptyKnowledgeState(),
      spots: { [String(hiddenSpot.id)]: 100 },
      regions: { [String(hiddenSpot.regionId)]: 100 },
    }
    const worldAtHiddenRegion = {
      ...createInitialWorld(),
      currentRegionId: hiddenSpot.regionId,
    }

    const undiscovered = leaveForSpot({
      context: { world: worldAtHiddenRegion, knowledge: hiddenKnowledge },
      spot: hiddenSpot,
      transports,
      playerTransports,
      permits: hiddenPermits,
    })
    push(
      '未発見の Hidden Spot は Transport 等が全部あっても移動できない（undiscovered）',
      !undiscovered.ok && undiscovered.reason === 'undiscovered',
    )

    const discoveredWorld = discoverSpotFromContact(worldAtHiddenRegion, hiddenSpot.id)
    const discoveredAccess = evaluateAccess({
      spot: hiddenSpot,
      transports,
      playerTransports,
      knowledge: hiddenKnowledge,
      permitsEnabled: true,
      permits: hiddenPermits,
    })
    const discoveredTravel = leaveForSpot({
      context: { world: discoveredWorld, knowledge: hiddenKnowledge },
      spot: hiddenSpot,
      transports,
      playerTransports,
      permits: hiddenPermits,
      ...(discoveredAccess.travelOptions[0] === undefined
        ? {}
        : { transportId: discoveredAccess.travelOptions[0].transportId }),
    })
    push(
      '発見済み + Access OK なら Hidden Spot へ移動できる',
      discoveredAccess.accessible && discoveredTravel.ok,
    )
    push(
      '未発見の Hidden Spot は Map の規則でも表示されない（isSpotKnown=false）',
      !isSpotKnown(worldAtHiddenRegion, hiddenSpot),
    )
  } else {
    push('未発見の Hidden Spot は Transport 等が全部あっても移動できない（undiscovered）', false)
    push('発見済み + Access OK なら Hidden Spot へ移動できる', false)
    push('未発見の Hidden Spot は Map の規則でも表示されない（isSpotKnown=false）', false)
  }

  lines.push(`species=${String(content.species.length)} spots=${String(content.spots.length)}`)
  lines.push(
    `buyers=${String(buyers.length)} speciesTradeProfiles=${String(content.speciesTradeProfiles.length)} contactRewards=${String(content.contactRewards.length)} hiddenSpots=${String(content.spots.filter((entry) => entry.visibility === 'hidden').length)}`,
  )
  lines.push(`trophy: izakaya ¥${String(izakayaTrophy)} / market ¥${String(marketTrophy)}`)
  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: trade network is healthy' : 'FAILED: trade network has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

// ---------------------------------------------------------------- trip model

const END_EVENTS: readonly FishingEvent[] = [
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'NO_BITE',
]

export type TripSimulationOptions = {
  readonly tripCount?: number
  readonly attemptsPerTrip?: number
  readonly seed?: string
  /** 1 か月あたり何回釣行するかの仮定（給与 economy との比較に使う）。 */
  readonly tripsPerMonth?: number
}

export type TripSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly TradeSimulationCheck[]
  readonly netPerTrip: readonly number[]
  readonly medianNet: number
  readonly p90Net: number
  readonly maxNet: number
}

type TripRecord = {
  readonly attempts: number
  readonly landed: number
  readonly kept: number
  readonly grossYen: number
  readonly travelCostYen: number
  readonly netYen: number
  readonly elapsedMinutes: number
}

const sortedAt = (sorted: readonly number[], ratio: number): number => {
  if (sorted.length === 0) {
    return 0
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(ratio * sorted.length)))
  return sorted[index] ?? 0
}

const medianOf = (sorted: readonly number[]): number =>
  sorted.length === 0 ? 0 : (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0)

const minutesOf = (time: WorldTime): number => (time.day * 24 + time.hour) * 60 + time.minute

/**
 * 1 釣行を最後まで回す。
 *
 * HOME → 移動（交通費）→ Spot 到着 → 釣り x attempts（LANDED は Keep）
 * → 帰宅 → 今いる地域の最も高く売れる買取先へ売却、まで既存 Domain で実行する。
 */
const runOneTrip = (input: {
  readonly content: ReturnType<typeof loadContentFromDirectory>
  readonly spot: FishingSpot
  readonly tripIndex: number
  readonly attemptsPerTrip: number
}): TripRecord | null => {
  const { content, spot, tripIndex, attemptsPerTrip } = input
  const transports = content.transports
  const playerTransports = fullTransportState(transports)
  const permits = content.spots.flatMap((entry) =>
    entry.access.flatMap((requirement) =>
      requirement.kind === 'permit' ? [String(requirement.permitId)] : [],
    ),
  )
  // 「この釣り場に何度も通ったプレイヤー」を想定し、Knowledge は満たした状態で見る。
  const knowledge = {
    ...emptyKnowledgeState(),
    spots: Object.fromEntries(content.spots.map((entry) => [String(entry.id), 100])),
    regions: Object.fromEntries(content.regions.map((entry) => [String(entry.id), 100])),
  }

  const access = evaluateAccess({
    spot,
    transports,
    playerTransports,
    knowledge,
    permitsEnabled: true,
    permits,
  })

  if (!access.accessible || access.travelOptions.length === 0) {
    return null
  }

  // Map の既定と同じく「最も安い移動手段」を選ぶ（プレイヤーの既定選択）。
  const option = defaultTravelOption(access.travelOptions)

  if (option === null) {
    return null
  }

  const travelCostYen = roundTripCostFor(option)
  const startTime: WorldTime = { year: 2026, month: 5, day: 2, hour: 6, minute: 0 }
  const initialWorld = {
    ...createInitialWorld(),
    currentRegionId: spot.regionId,
    time: startTime,
  }
  const left = leaveForSpot({
    context: { world: initialWorld, knowledge },
    spot,
    transports,
    playerTransports,
    permits,
    transportId: option.transportId,
  })

  if (!left.ok) {
    return null
  }

  const arrival = arriveAtSpot({ context: left.context, spot })

  if (!arrival.ok) {
    return null
  }

  let world = arrival.context.world
  let knowledgeState = arrival.context.knowledge
  const encounters: readonly EncounterCandidate[] = spot.fishTable.flatMap((occurrence) => {
    const candidate = content.speciesById[String(occurrence.speciesId)]
    return candidate === undefined
      ? []
      : [{ species: candidate, presence: occurrence.basePresence }]
  })
  const fishBox: KeptCatch[] = []
  let attempts = 0
  let landed = 0

  for (let attempt = 0; attempt < attemptsPerTrip; attempt += 1) {
    const engine = new FishingEngine({
      encounters,
      seed: `trip-${String(tripIndex)}-attempt-${String(attempt)}`,
      spotId: spot.id,
    })
    let guard = 0
    let phase = engine.snapshot().phase

    while (guard < 4000) {
      const snapshot = engine.snapshot()
      engine.dispatch(chooseCommand('balanced', snapshot))
      const result = engine.tick()
      guard += 1
      phase = result.snapshot.phase

      if (
        result.events.some((event) => END_EVENTS.includes(event)) ||
        isTerminalPhase(result.snapshot.phase)
      ) {
        break
      }
    }

    const individual = engine.snapshot().fish?.individual ?? null
    const isLanded = phase === 'LANDED' && individual !== null
    const attemptTime = world.time
    const recorded = recordFishingAttempt({
      context: { world, knowledge: knowledgeState },
      spot,
      outcome: isLanded ? 'landed' : 'failed',
      xpGained: 0,
      ...(isLanded ? { caughtLengthCm: individual.lengthCm } : {}),
    })

    if (!recorded.ok) {
      break
    }

    world = recorded.context.world
    knowledgeState = recorded.context.knowledge
    attempts += 1

    if (isLanded) {
      landed += 1
      const entry = toKeptCatch({
        individual,
        caughtAt: attemptTime,
        sourceSpotId: spot.id,
        sourceRegionId: spot.regionId,
      })
      const tradeProfile = content.speciesTradeProfileBySpeciesId[String(entry.speciesId)]

      // 取引できない魚は持ち帰らない（プレイヤーの合理的な選択）。
      if (tradeProfile !== undefined && tradeProfile.tradeStatus === 'tradable') {
        fishBox.push(entry)
      }
    }
  }

  const leftSpot = leaveSpot({
    context: { world, knowledge: knowledgeState },
    spot,
    transports,
    playerTransports,
    permits,
  })

  if (!leftSpot.ok) {
    return null
  }

  const home = arriveHome({ context: leftSpot.context })

  if (!home.ok) {
    return null
  }

  const now = home.context.world.time
  const tradeProfiles = Object.fromEntries(
    content.speciesTradeProfiles.map((entry) => [String(entry.speciesId), entry]),
  )
  const localBuyers = content.buyers.filter(
    (buyer) => String(buyer.regionId) === String(spot.regionId),
  )

  /*
   * プレイヤーは「今いる地域の買取先」のうち最も高く売れる相手を選ぶ。
   * 金額は quoteSale（Trade 画面と同じ関数）で解決する。
   */
  let best: { readonly buyer: (typeof localBuyers)[number]; readonly total: number } | null = null

  for (const buyer of localBuyers) {
    const quote = quoteSale({
      fishBox,
      catchIds: fishBox.map((entry) => entry.catchId),
      buyer,
      tradeProfileBySpeciesId: tradeProfiles,
      now,
    })

    if (best === null || quote.totalValueYen > best.total) {
      best = { buyer, total: quote.totalValueYen }
    }
  }

  let grossYen = 0

  if (best !== null && fishBox.length > 0) {
    const sale = sellCatches({
      fishBox,
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: best.buyer,
      currentRegionId: spot.regionId,
      catchIds: fishBox.map((entry) => entry.catchId),
      tradeProfileBySpeciesId: tradeProfiles,
      now,
    })

    if (sale.ok) {
      grossYen = sale.totalValueYen
    }
  }

  return {
    attempts,
    landed,
    kept: fishBox.length,
    grossYen,
    travelCostYen,
    netYen: grossYen - travelCostYen,
    elapsedMinutes: minutesOf(now) - minutesOf(startTime),
  }
}

/**
 * 釣行ベースのバランス確認。
 *
 * 「普通の釣行だけで給与 Economy（給与 ¥300,000 / 生活費 ¥180,000 /
 * 自由資金 約 ¥120,000 / 月）を壊していないか」を確認する。
 * これは現実の収入推定ではなく gameplay balance simulation である。
 */
export const simulateTradeTrips = (options: TripSimulationOptions = {}): TripSimulationResult => {
  const tripCount = options.tripCount ?? 120
  const attemptsPerTrip = options.attemptsPerTrip ?? 6
  const seed = options.seed ?? 'trade-trip-balance'
  const tripsPerMonth = options.tripsPerMonth ?? 8
  const content = loadContentFromDirectory()
  const random = new SeededRandomSource(seed)
  const tokyoSpots = content.spots.filter(
    (spot) =>
      String(spot.regionId) === 'tokyo-area' &&
      spot.visibility !== 'hidden' &&
      spot.fishTable.length > 0,
  )
  const checks: TradeSimulationCheck[] = []
  const lines: string[] = []
  const records: TripRecord[] = []

  if (tokyoSpots.length === 0) {
    return {
      exitCode: 1,
      lines: ['ERROR: no tokyo-area spots'],
      checks: [],
      netPerTrip: [],
      medianNet: 0,
      p90Net: 0,
      maxNet: 0,
    }
  }

  for (let index = 0; index < tripCount; index += 1) {
    const spot = tokyoSpots[random.int(0, tokyoSpots.length - 1)]

    if (spot === undefined) {
      continue
    }

    const record = runOneTrip({ content, spot, tripIndex: index, attemptsPerTrip })

    if (record !== null) {
      records.push(record)
    }
  }

  const totalOf = (pick: (record: TripRecord) => number): number =>
    records.reduce((sum, record) => sum + pick(record), 0)
  const perTrip = (pick: (record: TripRecord) => number): number =>
    records.length === 0 ? 0 : totalOf(pick) / records.length
  const nets = records.map((record) => record.netYen).sort((left, right) => left - right)
  const medianNet = medianOf(nets)
  const p90Net = sortedAt(nets, 0.9)
  const maxNet = nets.length === 0 ? 0 : (nets[nets.length - 1] ?? 0)
  const monthlyMedian = medianNet * tripsPerMonth
  const monthlyP90 = p90Net * tripsPerMonth
  const monthlySalary = createInitialFinanceState().salaryIncome
  const monthlyLiving = createInitialFinanceState().simplifiedLivingCost
  const monthlyFreeCash = monthlySalary - monthlyLiving

  checks.push({
    label: `${String(tripCount)} 釣行以上をシミュレーションする`,
    ok: records.length >= 100,
  })
  checks.push({
    label: '1 釣行に複数回の釣り試行（attempt）が入る',
    ok: perTrip((record) => record.attempts) >= 2,
  })
  checks.push({
    label: '普通の釣行（中央値）だけで月の自由資金を超えない',
    ok: monthlyMedian < monthlyFreeCash,
  })
  checks.push({
    label: '上振れ（p90）の釣行でも月給を壊さない',
    ok: monthlyP90 < monthlySalary,
  })
  checks.push({
    label: '中央値の釣行が赤字にならない（交通費込み）',
    ok: medianNet >= 0,
  })

  lines.push(
    '',
    `--- trip simulation (${String(records.length)} trips x ${String(attemptsPerTrip)} attempts, seed fixed) ---`,
    `trips=${String(records.length)}`,
    `attempts/trip=${perTrip((record) => record.attempts).toFixed(2)}`,
    `landed/trip=${perTrip((record) => record.landed).toFixed(2)}`,
    `kept/trip=${perTrip((record) => record.kept).toFixed(2)}`,
    `gross sale/trip=¥${String(Math.round(perTrip((record) => record.grossYen)))}`,
    `travel cost/trip=¥${String(Math.round(perTrip((record) => record.travelCostYen)))}`,
    `net profit/trip(mean)=¥${String(Math.round(perTrip((record) => record.netYen)))}`,
    `net median=¥${String(medianNet)}`,
    `net p90=¥${String(p90Net)}`,
    `net max=¥${String(maxNet)}`,
    `elapsed mean=${perTrip((record) => record.elapsedMinutes).toFixed(1)} min/trip`,
    `monthly-equivalent (median x ${String(tripsPerMonth)} trips)=¥${String(monthlyMedian)}`,
    `monthly-equivalent (p90 x ${String(tripsPerMonth)} trips)=¥${String(monthlyP90)}`,
    `reference: salary ¥${String(monthlySalary)} / living ¥${String(monthlyLiving)} / free cash ¥${String(monthlyFreeCash)} per month`,
    'note: PROVISIONAL な gameplay balance simulation（現実の収入推定ではない）',
  )

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  return {
    exitCode: checks.every((check) => check.ok) ? 0 : 1,
    lines,
    checks,
    netPerTrip: nets,
    medianNet,
    p90Net,
    maxNet,
  }
}

/** 全 runtime Species が tradeTags を持つこと（validate:content と二重に確認する）。 */
export const auditTradeTags = (): readonly TradeSimulationCheck[] => {
  const content = loadContentFromDirectory()
  const knownTags = new Set<string>(TRADE_TAGS)
  const untagged = content.speciesTradeProfiles.filter((profile) => profile.tradeTags.length === 0)
  const unknownTags = content.speciesTradeProfiles.flatMap((profile) =>
    profile.tradeTags.filter((tag: TradeTag) => !knownTags.has(tag)),
  )

  return [
    {
      label: `全 runtime Species（${String(content.species.length)}）が tradeProfile を持つ`,
      ok: content.species.every(
        (species) => content.speciesTradeProfileBySpeciesId[String(species.id)] !== undefined,
      ),
    },
    {
      label: `tradable profile は全て 1 つ以上の tradeTags を持つ（${String(content.speciesTradeProfiles.length)} 件）`,
      ok: untagged.length === 0,
    },
    { label: '未知の tradeTag が無い', ok: unknownTags.length === 0 },
  ]
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateTradeNetwork()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    const tagChecks = auditTradeTags()
    process.stdout.write('\n--- species trade tags ---\n')
    for (const check of tagChecks) {
      process.stdout.write(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}\n`)
    }

    const trips = simulateTradeTrips()
    for (const line of trips.lines) {
      process.stdout.write(`${line}\n`)
    }

    const allOk =
      result.exitCode === 0 && [...tagChecks, ...trips.checks].every((check) => check.ok)
    process.exitCode = allOk ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
