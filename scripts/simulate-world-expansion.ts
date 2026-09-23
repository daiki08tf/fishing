import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { DEFAULT_ECONOMY_TUNING } from '../src/domain/economy'
import { DEFAULT_WORLD_TUNING } from '../src/domain/world/WorldTuning'
import type { FishingSpot } from '../src/domain/world/FishingSpot'

/**
 * World Expansion の監査（Phase 16）。
 *
 * 決定論的。Spot ごとの Encounter 構成（外道の混ざり方）と、
 * Species の identity（canonical global ID / scientificName 重複）を検査する。
 *
 * Hard failure:
 * - fishTable が空 / Species 参照切れ / presence 合計 0 / 同じ Species の重複 entry
 * - zoneAffinity が存在しない zone を指す
 * Warning（生物学的事実ではなくゲームバランスの目安）:
 * - 野生的な Spot で 1 種が支配的（share > 0.6）
 * - 有効多様性が低い（< 2.0）
 * - ほぼ rare だけで構成されている（全 presence <= 0.2）
 */

export type WorldExpansionCheck = {
  readonly label: string
  readonly ok: boolean
}

export type WorldExpansionResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly WorldExpansionCheck[]
  readonly warnings: readonly string[]
}

type SpotAudit = {
  readonly spot: FishingSpot
  readonly occurrences: number
  readonly topShare: number
  readonly effectiveDiversity: number
  readonly rareCount: number
  readonly warnings: readonly string[]
}

const WILD_ENVIRONMENTS = new Set([
  'river',
  'canal',
  'estuary',
  'lake',
  'bay_shore',
  'nearshore',
  'offshore',
])

/**
 * Phase 16 で追加した地域。ここでは「外道が混ざる」ことを Hard に検査する
 * （既存 Phase の Spot は、その時点の設計を尊重して warning に留める）。
 */
const PHASE_16_REGIONS = new Set([
  'izu-peninsula',
  'tohoku-pacific',
  'hokuriku-japan-sea',
  'okinawa',
  'norway-fjords',
  'new-zealand',
  'baja-california',
  'thailand',
  'amazon-basin',
])

/** 逆 Simpson 指数（1 に近いほど 1 種支配、値が大きいほど多様）。 */
const effectiveDiversity = (presences: readonly number[]): number => {
  const total = presences.reduce((sum, value) => sum + value, 0)

  if (total <= 0) {
    return 0
  }

  const sumSquares = presences.reduce((sum, value) => {
    const share = value / total
    return sum + share * share
  }, 0)

  return sumSquares <= 0 ? 0 : 1 / sumSquares
}

export const auditSpot = (spot: FishingSpot, knownSpeciesIds: ReadonlySet<string>): SpotAudit => {
  const warnings: string[] = []
  const presences = spot.fishTable.map((occurrence) => occurrence.basePresence)
  const total = presences.reduce((sum, value) => sum + value, 0)
  const top = presences.length === 0 ? 0 : Math.max(...presences)
  const topShare = total <= 0 ? 0 : top / total
  const diversity = effectiveDiversity(presences)
  const rareCount = presences.filter((presence) => presence <= 0.2).length
  const isWild = WILD_ENVIRONMENTS.has(spot.environment)

  for (const occurrence of spot.fishTable) {
    if (!knownSpeciesIds.has(String(occurrence.speciesId))) {
      warnings.push(`unknown species ${String(occurrence.speciesId)}`)
    }
  }

  if (isWild && topShare > 0.6) {
    warnings.push(
      `one species dominates ${String(Math.round(topShare * 100))}% of the encounter weight`,
    )
  }

  if (isWild && presences.length >= 3 && diversity < 2) {
    warnings.push(`low effective diversity (${diversity.toFixed(2)})`)
  }

  if (isWild && presences.length > 0 && presences.every((presence) => presence <= 0.2)) {
    warnings.push('every species is rare (no common bycatch)')
  }

  return {
    spot,
    occurrences: spot.fishTable.length,
    topShare,
    effectiveDiversity: diversity,
    rareCount,
    warnings,
  }
}

export const simulateWorldExpansion = (): WorldExpansionResult => {
  const content = loadContentFromDirectory()
  const checks: WorldExpansionCheck[] = []
  const lines: string[] = []
  const warnings: string[] = []
  const push = (label: string, ok: boolean): void => {
    checks.push({ label, ok })
  }

  const playableRegions = content.regions.filter((region) => region.stage === 'playable')
  const knownSpeciesIds = new Set(content.species.map((species) => String(species.id)))
  const audits = content.spots.map((spot) => auditSpot(spot, knownSpeciesIds))

  const publicSpots = content.spots.filter((spot) => spot.visibility !== 'hidden')
  const hiddenSpotCount = content.spots.length - publicSpots.length

  lines.push('--- world summary ---')
  lines.push(
    [
      `countries=${String(content.countries.length)}`,
      `playableRegions=${String(playableRegions.length)}`,
      `species=${String(content.species.length)}`,
      `spots=${String(content.spots.length)}`,
      `publicSpots=${String(publicSpots.length)}`,
      `hiddenSpots=${String(hiddenSpotCount)}`,
      `buyers=${String(content.buyers.length)}`,
      `contactRewards=${String(content.contactRewards.length)}`,
      `expeditions=${String(content.expeditions.length)}`,
    ].join(' '),
  )

  // 1. Hard failures.
  const emptySpots = content.spots.filter((spot) => spot.fishTable.length === 0)
  const zeroPresenceSpots = content.spots.filter(
    (spot) => spot.fishTable.reduce((sum, occurrence) => sum + occurrence.basePresence, 0) <= 0,
  )
  const duplicateOccurrences = content.spots.filter((spot) => {
    const ids = spot.fishTable.map((occurrence) => String(occurrence.speciesId))
    return new Set(ids).size !== ids.length
  })
  const unknownSpecies = audits.flatMap((audit) =>
    audit.warnings.filter((warning) => warning.startsWith('unknown species')),
  )
  const invalidZoneAffinity = content.spots.filter((spot) => {
    const zoneIds = new Set((spot.fishingZones ?? []).map((zone) => zone.id))
    return spot.fishTable.some((occurrence) =>
      Object.keys(occurrence.zoneAffinity ?? {}).some((zoneId) => !zoneIds.has(zoneId)),
    )
  })

  push('every Spot has an encounter table', emptySpots.length === 0)
  push('every Spot has non-zero total presence', zeroPresenceSpots.length === 0)
  push('no Spot lists the same Species twice', duplicateOccurrences.length === 0)
  push('every occurrence references a known Species', unknownSpecies.length === 0)
  push('every zoneAffinity points at an existing zone', invalidZoneAffinity.length === 0)

  // 2. Bycatch / diversity expectations for wild spots.
  const wildSpots = audits.filter(
    (audit) => WILD_ENVIRONMENTS.has(audit.spot.environment) && audit.spot.visibility !== 'hidden',
  )
  const phase16WildSpots = wildSpots.filter((audit) =>
    PHASE_16_REGIONS.has(String(audit.spot.regionId)),
  )
  const thinPhase16Spots = phase16WildSpots.filter((audit) => audit.occurrences < 4)
  const thinLegacySpots = wildSpots.filter(
    (audit) => !PHASE_16_REGIONS.has(String(audit.spot.regionId)) && audit.occurrences < 4,
  )

  push(
    'every Phase 16 wild Spot offers at least 4 species (bycatch)',
    thinPhase16Spots.length === 0,
  )

  for (const audit of thinLegacySpots) {
    warnings.push(
      `${String(audit.spot.id)}: legacy Spot has only ${String(audit.occurrences)} species (Phase 16 policy is 4+)`,
    )
  }

  // 3. Hidden Spot / discovery integrity.
  const hiddenSpots = content.spots.filter((spot) => spot.visibility === 'hidden')
  const discoverTargets = new Set(
    content.contactRewards
      .filter((reward) => reward.kind === 'discover_spot')
      .map((reward) => String(reward.targetId)),
  )
  const undiscoverable = hiddenSpots.filter((spot) => !discoverTargets.has(String(spot.id)))

  push('every hidden Spot has a discover_spot reward', undiscoverable.length === 0)
  push(
    'every hidden Spot has an explicit fishingZone',
    hiddenSpots.every((spot) => (spot.fishingZones?.length ?? 0) > 0),
  )

  // 4. Region wiring: spots, packs, buyers, expeditions.
  const regionWithSpots = new Set(content.spots.map((spot) => String(spot.regionId)))
  const regionsWithoutSpots = playableRegions.filter(
    (region) => !regionWithSpots.has(String(region.id)),
  )
  const expeditionsByRegion = new Set(content.expeditions.map((entry) => String(entry.regionId)))
  const regionsWithoutExpedition = playableRegions.filter(
    (region) =>
      String(region.id) !== DEFAULT_WORLD_TUNING.homeRegionId &&
      !expeditionsByRegion.has(String(region.id)),
  )

  push('every playable Region has fishing spots', regionsWithoutSpots.length === 0)
  push(
    'every playable Region (home を除く) has an expedition',
    regionsWithoutExpedition.length === 0,
  )

  // 5. Species identity (canonical global IDs / scientificName duplication report).
  const scientificNames = new Map<string, string[]>()
  for (const species of content.species) {
    if (species.scientificName === undefined) {
      continue
    }

    scientificNames.set(species.scientificName, [
      ...(scientificNames.get(species.scientificName) ?? []),
      String(species.id),
    ])
  }

  const duplicateScientificNames = [...scientificNames.entries()].filter(
    ([, ids]) => ids.length > 1,
  )

  /*
   * scientificName の重複は「同じ生物に 2 つの canonical ID がある」可能性を示す。
   * 既存 Content にも 1 組（giant-queenfish / queenfish）があり、ID の統合は
   * Save / Trade / Codex に触れる作業になるため、Phase 16 では **warning として報告**し、
   * Hard failure にはしない（新しい重複を増やさないことは下の check で担保する）。
   */
  const KNOWN_LEGACY_DUPLICATES = new Set(['giant-queenfish', 'queenfish'])

  push(
    'no Phase 16 Species duplicates an existing scientificName',
    duplicateScientificNames.every(([, ids]) =>
      ids.every((id) => KNOWN_LEGACY_DUPLICATES.has(String(id))),
    ),
  )

  for (const [name, ids] of duplicateScientificNames) {
    warnings.push(`scientificName duplicate: ${name} -> ${ids.join(', ')}`)
  }

  // 6. Balance report + warnings.
  const expeditionCostOf = (regionId: string): number | null => {
    const expedition = content.expeditions.find((entry) => String(entry.regionId) === regionId)

    if (expedition === undefined) {
      return null
    }

    const lodging = expedition.lodgings[Math.floor((expedition.lodgings.length - 1) / 2)]

    return (
      expedition.journey.oneWayCostYen * 2 +
      (lodging?.nightlyCostYen ?? 0) * expedition.nights.default +
      (expedition.permit?.costYen ?? 0)
    )
  }

  const regionRows = playableRegions.map((region) => {
    const regionId = String(region.id)
    const regionAudits = audits.filter((audit) => String(audit.spot.regionId) === regionId)
    const regionSpots = content.spots.filter((spot) => String(spot.regionId) === regionId)
    const speciesInRegion = new Set(
      regionAudits.flatMap((audit) =>
        audit.spot.fishTable.map((occurrence) => String(occurrence.speciesId)),
      ),
    )
    const meanDiversity =
      regionAudits.length === 0
        ? 0
        : regionAudits.reduce((sum, audit) => sum + audit.effectiveDiversity, 0) /
          regionAudits.length
    const warningCount = regionAudits.reduce((sum, audit) => sum + audit.warnings.length, 0)

    return {
      regionId,
      spots: regionAudits.length,
      publicSpots: regionSpots.filter((spot) => spot.visibility !== 'hidden').length,
      hiddenSpots: regionSpots.filter((spot) => spot.visibility === 'hidden').length,
      environments: new Set(regionSpots.map((spot) => spot.environment)).size,
      species: speciesInRegion.size,
      buyers: content.buyers.filter((buyer) => String(buyer.regionId) === regionId).length,
      rewards: content.contactRewards.filter((reward) =>
        content.buyers.some(
          (buyer) =>
            String(buyer.regionId) === regionId && String(buyer.id) === String(reward.contactId),
        ),
      ).length,
      expeditionCost: expeditionCostOf(regionId),
      meanDiversity,
      warningCount,
    }
  })

  lines.push('')
  lines.push('--- region report ---')
  for (const row of regionRows) {
    lines.push(
      `  ${row.regionId.padEnd(22)} spots=${String(row.spots).padStart(2)}(public ${String(row.publicSpots)} / hidden ${String(row.hiddenSpots)}) env=${String(row.environments)} species=${String(row.species).padStart(3)} buyers=${String(row.buyers)} rewards=${String(row.rewards)} expCost=${row.expeditionCost === null ? '—' : `¥${String(row.expeditionCost)}`} diversity=${row.meanDiversity.toFixed(2)} warn=${String(row.warningCount)}`,
    )
  }

  lines.push('')
  lines.push('--- spot warnings (balance hint, not biology) ---')
  for (const audit of audits) {
    for (const warning of audit.warnings) {
      warnings.push(`${String(audit.spot.id)}: ${warning}`)
    }
  }

  if (warnings.length === 0) {
    lines.push('  (none)')
  } else {
    for (const warning of warnings) {
      lines.push(`  WARN ${warning}`)
    }
  }

  const allOk = checks.every((check) => check.ok)

  lines.push('')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  /*
   * 7. Trust chain balance（Phase 16 Part 2 / item 16）。
   * 「1 回の売却で全部解禁」「何十回売っても何も起きない」の両方を避ける。
   * 平均 quality 0.5 の売却で見積もる（PROVISIONAL）。
   */
  const trustRows = playableRegions.flatMap((region) => {
    const regionId = String(region.id)
    const buyers = content.buyers.filter((buyer) => String(buyer.regionId) === regionId)
    const rewards = content.contactRewards.filter((reward) =>
      buyers.some((buyer) => String(buyer.id) === String(reward.contactId)),
    )
    const gain =
      buyers.length === 0
        ? 0
        : Math.max(
            ...buyers.map((buyer) =>
              Math.min(
                buyer.trustProfile.maxPerTransaction,
                Math.round(
                  buyer.trustProfile.perTransactionBase + buyer.trustProfile.qualityWeight * 0.5,
                ),
              ),
            ),
          )
    const first = rewards
      .filter((reward) => reward.kind === 'intel')
      .map((reward) => reward.minTrust)
      .sort((left, right) => left - right)[0]
    const discovery = rewards
      .filter((reward) => reward.kind === 'discover_spot')
      .map((reward) => reward.minTrust)
      .sort((left, right) => left - right)[0]

    return gain <= 0 || first === undefined || discovery === undefined
      ? []
      : [
          {
            regionId,
            buyers: buyers.length,
            gainPerSale: gain,
            firstRewardTrust: first,
            discoveryTrust: discovery,
            salesToFirst: Math.ceil(first / gain),
            salesToDiscovery: Math.ceil(discovery / gain),
          },
        ]
  })

  lines.push('')
  lines.push('--- trust chain balance (PROVISIONAL, avg quality 0.5 sale) ---')
  for (const row of trustRows) {
    lines.push(
      `  ${row.regionId.padEnd(22)} buyers=${String(row.buyers)} trust/sale≈${String(row.gainPerSale)} first=${String(row.firstRewardTrust)}(≈${String(row.salesToFirst)} sales) discovery=${String(row.discoveryTrust)}(≈${String(row.salesToDiscovery)} sales)`,
    )
  }

  push(
    'no Region unlocks its hidden spot from a single sale',
    trustRows.every((row) => row.salesToDiscovery >= 2),
  )
  push(
    'no Region needs more than 10 sales for its first reward',
    trustRows.every((row) => row.salesToFirst <= 10),
  )

  for (const row of trustRows) {
    if (row.salesToDiscovery > 15) {
      warnings.push(`${row.regionId}: hidden discovery needs ${String(row.salesToDiscovery)} sales`)
    }
  }

  /*
   * 8. Expedition economy（item 18/19）。total = 往復航空券 + 既定泊の宿 + 許可。
   * 現実の旅行価格ではなく PROVISIONAL なゲーム調整値。
   */
  const freeCash = DEFAULT_ECONOMY_TUNING.monthlySalary - DEFAULT_ECONOMY_TUNING.monthlyLivingCost
  const expeditionRows = content.expeditions
    .map((expedition) => {
      const lodging = expedition.lodgings[Math.floor((expedition.lodgings.length - 1) / 2)]
      const total =
        expedition.journey.oneWayCostYen * 2 +
        (lodging?.nightlyCostYen ?? 0) * expedition.nights.default +
        (expedition.permit?.costYen ?? 0)

      return {
        regionId: String(expedition.regionId),
        journeyKind: expedition.journey.kind,
        nights: expedition.nights.default,
        total,
        monthsOfFreeCash: total / freeCash,
      }
    })
    .sort((left, right) => left.total - right.total)

  lines.push('')
  lines.push('--- expedition economy (PROVISIONAL; return journey + default nights + permit) ---')
  for (const row of expeditionRows) {
    lines.push(
      `  ${row.regionId.padEnd(22)} ${row.journeyKind.padEnd(20)} nights=${String(row.nights)} total=¥${String(row.total)}（自由資金 ${row.monthsOfFreeCash.toFixed(2)} か月分）`,
    )
  }

  const domestic = expeditionRows.filter((row) => row.journeyKind === 'domestic_flight')
  const international = expeditionRows.filter((row) => row.journeyKind === 'international_flight')
  const mostExpensiveDomestic = Math.max(...domestic.map((row) => row.total), 0)
  const cheapestInternational = Math.min(
    ...international.map((row) => row.total),
    Number.MAX_SAFE_INTEGER,
  )

  push(
    'domestic trips are cheaper than the cheapest international trip',
    international.length === 0 || mostExpensiveDomestic < cheapestInternational,
  )
  push('Izu is the cheapest trip', expeditionRows[0]?.regionId === 'izu-peninsula')
  push(
    'Amazon is the most expensive trip',
    expeditionRows[expeditionRows.length - 1]?.regionId === 'amazon-basin',
  )
  push(
    'no trip costs more than 6 months of free cash',
    expeditionRows.every((row) => row.monthsOfFreeCash <= 6),
  )

  /*
   * 9. Region occurrence diversity（item 4）に対する参考レポート。
   * 目標下限を下回る Region は warning（Part 2b の作業対象）として報告する。
   */
  const REGION_SPECIES_TARGETS: Readonly<Record<string, number>> = {
    'izu-peninsula': 22,
    'tohoku-pacific': 22,
    'hokuriku-japan-sea': 22,
    okinawa: 30,
    'norway-fjords': 25,
    'new-zealand': 25,
    'baja-california': 25,
    thailand: 30,
    'amazon-basin': 30,
  }

  lines.push('')
  lines.push('--- region occurrence diversity (target = item 4 range minimum) ---')
  for (const row of regionRows) {
    const target = REGION_SPECIES_TARGETS[row.regionId]

    lines.push(
      `  ${row.regionId.padEnd(22)} species=${String(row.species).padStart(3)}${
        target === undefined
          ? ''
          : ` target>=${String(target)}${row.species < target ? '  ← below' : '  ok'}`
      }`,
    )

    if (target !== undefined && row.species < target) {
      warnings.push(
        `${row.regionId}: ${String(row.species)} species is below the Phase 16 target ${String(target)} (Part 2b)`,
      )
    }
  }

  lines.push('', allOk ? 'OK: world expansion is healthy' : 'FAILED: world expansion has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks, warnings }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  const result = simulateWorldExpansion()

  for (const line of result.lines) {
    process.stdout.write(`${line}\n`)
  }

  process.exitCode = result.exitCode
}
