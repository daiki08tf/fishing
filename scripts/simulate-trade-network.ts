import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { evaluateAccess } from '../src/domain/access/accessEngine'
import { generateFishIndividual } from '../src/domain/fish/generateFishIndividual'
import type { FishSpecies } from '../src/domain/fish/FishSpecies'
import { createInitialFinanceState } from '../src/domain/economy'
import { asFishingSpotId, asRegionId, asTransportId } from '../src/domain/ids'
import { emptyKnowledgeState } from '../src/domain/knowledge/KnowledgeState'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'
import {
  addKeptCatch,
  calcSaleValueYen,
  claimEligibleRewards,
  createInitialTradeState,
  sellCatches,
  toKeptCatch,
} from '../src/domain/trade'
import {
  createInitialTransportState,
  type PlayerTransportState,
} from '../src/domain/access/Transport'
import { createInitialWorld, discoverSpotFromContact } from '../src/domain/world/worldSession'
import type { WorldTime } from '../src/domain/world/WorldTime'
import { migrateV8ToV9 } from '../src/infrastructure/persistence/migrateSave'
import { createValidSaveV8 } from '../tests/fixtures/save'

/**
 * Fish Trade / Contacts / Hidden Spot の 1 本通し（Phase 13）。
 *
 * 実 Content（buyers / species-trade-profiles / contact-rewards / fishing-spots）を
 * 読み込み、Keep/Release → Fish Box → Sell → Trust → Reward → Hidden Spot discovery →
 * Access までの Core Loop を domain 関数だけで検証する（FishingEngine は使わない。
 * 個体生成は Phase 2 の generateFishIndividual を直接使う）。
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

const time = (overrides: Partial<WorldTime> = {}): WorldTime => ({
  ...createInitialWorld().time,
  ...overrides,
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
    (candidate) => String(candidate.regionId) === 'tokyo-area' && candidate.fishTable.length > 0,
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
  const landedAt = time({ hour: 6 })

  const land = (seed: string) =>
    generateFishIndividual({ species, random, individualSeed: seed, spotId: spot.id })

  // 1 & 2. Keep / Release は Fish Box への追加だけを左右する。
  const kept = land('keep-1')
  const released = land('release-1')
  let fishBox = addKeptCatch(
    [],
    toKeptCatch({
      individual: kept.individual,
      caughtAt: landedAt,
      sourceSpotId: spot.id,
      sourceRegionId: spot.regionId,
    }),
  )
  push('Keep した個体だけが Fish Box に 1 匹入る', fishBox.length === 1)
  push(
    'Release した個体は Fish Box に入らない',
    !fishBox.some((entry) => String(entry.catchId) === String(released.individual.id)),
  )

  // 二重追加されないこと。
  fishBox = addKeptCatch(
    fishBox,
    toKeptCatch({
      individual: kept.individual,
      caughtAt: landedAt,
      sourceSpotId: spot.id,
      sourceRegionId: spot.regionId,
    }),
  )
  push('同じ catch を 2 回 Keep しても Fish Box は 1 匹のまま', fishBox.length === 1)

  // 5 & 6. 売却で Fish Box から消え、Finance が増え、transaction が追加され、Trust が増える。買取先で査定が違う。
  const tradeProfiles = { [String(species.id)]: profile }
  const izakayaSale = sellCatches({
    fishBox,
    finance: createInitialFinanceState(),
    trade: createInitialTradeState(),
    buyer: izakaya,
    catchIds: [kept.individual.id],
    tradeProfileBySpeciesId: tradeProfiles,
    now: time({ hour: 7 }),
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
  push('売却後 Buyer Trust が増える', izakayaSale.ok && izakayaSale.trustGain > 0)
  // 最小単価 floor に張り付かないよう、Trophy 級の個体で買取先ごとの差を確認する。
  const trophyEntry = toKeptCatch({
    individual: kept.individual,
    caughtAt: landedAt,
    sourceSpotId: spot.id,
    sourceRegionId: spot.regionId,
  })
  const trophyLike = {
    ...trophyEntry,
    condition: 0.95,
    percentile: 97,
    weightKg: trophyEntry.weightKg * 5,
  }
  const izakayaTrophyValue = calcSaleValueYen(trophyLike, izakaya, profile, 1)
  const marketTrophyValue = calcSaleValueYen(trophyLike, market, profile, 1)
  push(
    '同じ魚でも買取先ごとに査定が違う（サイズ・品質への感度が異なる）',
    izakayaTrophyValue !== marketTrophyValue,
  )

  // 4. 同じ catch は 1 回しか売れない。
  if (izakayaSale.ok) {
    const resell = sellCatches({
      fishBox: izakayaSale.fishBox,
      finance: izakayaSale.finance,
      trade: izakayaSale.trade,
      buyer: izakaya,
      catchIds: [kept.individual.id],
      tradeProfileBySpeciesId: tradeProfiles,
      now: time({ hour: 8 }),
    })
    push('同じ catch を 2 回売れない', !resell.ok)
  } else {
    push('同じ catch を 2 回売れない', false)
  }

  // 7. Trust threshold 直前は reward なし、到達で 1 度だけ。
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

  // 8. Save/load しても reward が二重付与されない（v8 → v9 migration 経由）。
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

  // 9〜13. Hidden Spot: discovery と access は分離している。
  const hiddenSpot = content.spots.find((candidate) => candidate.visibility === 'hidden')

  if (hiddenSpot !== undefined) {
    let world = createInitialWorld()
    world = { ...world, currentRegionId: hiddenSpot.regionId }

    const fullTransportState: PlayerTransportState = {
      availableTransportIds: content.transports.map((entry) => entry.id),
      ownedTransportIds: content.transports.map((entry) => entry.id),
    }
    const noTransportState = createInitialTransportState(asTransportId)
    const knowledge = emptyKnowledgeState()

    const accessEvenIfCapable = evaluateAccess({
      spot: hiddenSpot,
      transports: content.transports,
      playerTransports: fullTransportState,
      knowledge,
      permitsEnabled: true,
    })
    push(
      'Hidden Spot: access capability があっても discovered 前は Map（discoveredSpotIds）に出ない',
      accessEvenIfCapable.accessible && !world.discoveredSpotIds.includes(hiddenSpot.id),
    )

    world = discoverSpotFromContact(world, hiddenSpot.id)
    push(
      'Hidden Spot: discover すると discoveredSpotIds に載る（Map に出る）',
      world.discoveredSpotIds.includes(hiddenSpot.id),
    )

    const accessWithoutTransport = evaluateAccess({
      spot: hiddenSpot,
      transports: content.transports,
      playerTransports: noTransportState,
      knowledge,
      permitsEnabled: true,
    })
    push(
      'Hidden Spot: discover 済みでも Transport が無ければ AccessEngine が block する',
      world.discoveredSpotIds.includes(hiddenSpot.id) && !accessWithoutTransport.accessible,
    )

    // 12 & 13. rumor（intel）だけでは Spot が出ず、discover_spot 報酬で初めて出る。
    const chainRewards = content.contactRewards.filter(
      (reward) =>
        reward.kind === 'discover_spot' && String(reward.targetId) === String(hiddenSpot.id),
    )
    const rumorForSameContact =
      chainRewards[0] === undefined
        ? []
        : content.contactRewards.filter(
            (reward) =>
              reward.kind === 'intel' &&
              String(reward.contactId) === String(chainRewards[0]?.contactId),
          )

    push('Hidden Spot: discover_spot 報酬が Content 上に存在する', chainRewards.length > 0)
    push(
      'Hidden Spot: rumor（intel）だけでは対象 Spot は discoveredSpotIds に追加されない',
      rumorForSameContact.every((reward) => reward.kind === 'intel'),
    )
  } else {
    for (const label of [
      'Hidden Spot: access capability があっても discovered 前は Map（discoveredSpotIds）に出ない',
      'Hidden Spot: discover すると discoveredSpotIds に載る（Map に出る）',
      'Hidden Spot: discover 済みでも Transport が無ければ AccessEngine が block する',
      'Hidden Spot: discover_spot 報酬が Content 上に存在する',
      'Hidden Spot: rumor（intel）だけでは対象 Spot は discoveredSpotIds に追加されない',
    ]) {
      push(label, false)
    }
  }

  // 15. 価格計算は deterministic。
  const again = sellCatches({
    fishBox,
    finance: createInitialFinanceState(),
    trade: createInitialTradeState(),
    buyer: izakaya,
    catchIds: [kept.individual.id],
    tradeProfileBySpeciesId: tradeProfiles,
    now: time({ hour: 7 }),
  })
  push(
    '売却額は deterministic（同じ入力なら同じ結果）',
    izakayaSale.ok && again.ok && izakayaSale.totalValueYen === again.totalValueYen,
  )

  // 16. 全 runtime Species は明示的な trade status を持つ。
  const uncovered = content.species.filter(
    (entry) => content.speciesTradeProfileBySpeciesId[String(entry.id)] === undefined,
  )
  push(
    `全 runtime Species（${String(content.species.length)}）が species-trade-profiles を持つ`,
    uncovered.length === 0,
  )

  // 17. Hidden Spot にも Fishing Zone がある。
  const hiddenSpots = content.spots.filter((entry) => entry.visibility === 'hidden')
  const hiddenWithoutZone = hiddenSpots.filter((entry) => (entry.fishingZones?.length ?? 0) === 0)
  push(
    `Hidden Spot（${String(hiddenSpots.length)}）は全て explicit Fishing Zone を持つ`,
    hiddenWithoutZone.length === 0,
  )

  lines.push(`species=${String(content.species.length)} spots=${String(content.spots.length)}`)
  lines.push(
    `buyers=${String(buyers.length)} speciesTradeProfiles=${String(content.speciesTradeProfiles.length)} contactRewards=${String(content.contactRewards.length)} hiddenSpots=${String(hiddenSpots.length)}`,
  )
  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('', allOk ? 'OK: trade network is healthy' : 'FAILED: trade network has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

/**
 * バランス確認: 普通の Tokyo 近郊釣行を複数 seed でシミュレーションし、
 * 1 釣行あたりの kept fish 数・売却額・Trust 上昇の目安を集計する。
 *
 * FishingEngine 全体は動かさない（Encounter 抽選の重み付けまでは踏み込まない）。
 * Spot の fishTable から均等にランダムな 1 魚種を選び、生成した個体をそのまま
 * 売った場合の値を見る、簡略化した目安である。給与システムを無意味にしないかどうかの
 * 大まかな確認が目的で、正式なバランス調整は人間のプレイテストに委ねる。
 */
const simulateBalance = (
  content: ReturnType<typeof loadContentFromDirectory>,
  tripCount: number,
): readonly string[] => {
  const tokyoSpots = content.spots.filter(
    (spot) => String(spot.regionId) === 'tokyo-area' && spot.fishTable.length > 0,
  )
  const izakaya = content.buyers.find((entry) => entry.buyerType === 'izakaya')

  if (tokyoSpots.length === 0 || izakaya === undefined) {
    return ['balance: skipped (missing tokyo-area content)']
  }

  const random = new SeededRandomSource('trade-network-balance')
  const values: number[] = []

  for (let trip = 0; trip < tripCount; trip += 1) {
    const spot = tokyoSpots[random.int(0, tokyoSpots.length - 1)]
    const occurrence = spot?.fishTable[random.int(0, (spot.fishTable.length ?? 1) - 1)]
    const species =
      occurrence === undefined ? undefined : content.speciesById[String(occurrence.speciesId)]
    const profile =
      species === undefined ? undefined : content.speciesTradeProfileBySpeciesId[String(species.id)]

    if (species === undefined || profile === undefined || profile.tradeStatus !== 'tradable') {
      continue
    }

    const generated = generateFishIndividual({
      species,
      random,
      individualSeed: `balance-${String(trip)}`,
    })
    const entry = toKeptCatch({
      individual: generated.individual,
      caughtAt: time({ hour: 6 }),
      sourceSpotId: spot?.id ?? asFishingSpotId('unknown'),
      sourceRegionId: asRegionId('tokyo-area'),
    })
    const sale = sellCatches({
      fishBox: [entry],
      finance: createInitialFinanceState(),
      trade: createInitialTradeState(),
      buyer: izakaya,
      catchIds: [entry.catchId],
      tradeProfileBySpeciesId: { [String(species.id)]: profile },
      now: time({ hour: 7 }),
    })

    if (sale.ok) {
      values.push(sale.totalValueYen)
    }
  }

  values.sort((left, right) => left - right)
  const sum = values.reduce((total, value) => total + value, 0)
  const median = values[Math.floor(values.length / 2)] ?? 0

  return [
    `balance: ${String(values.length)} priced trips / ${String(tripCount)} sampled`,
    `balance: 平均 ¥${String(Math.round(sum / Math.max(1, values.length)))} / 中央値 ¥${String(median)} / 最小 ¥${String(values[0] ?? 0)} / 最大 ¥${String(values[values.length - 1] ?? 0)}`,
    'balance: これは PROVISIONAL な目安であり、現実の市場価格の主張ではない',
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

    const content = loadContentFromDirectory()
    process.stdout.write('\n--- balance (120 trips, seed fixed) ---\n')
    for (const line of simulateBalance(content, 120)) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
