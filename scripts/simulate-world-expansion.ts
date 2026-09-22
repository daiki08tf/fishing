import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
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

  lines.push(
    `world: species=${String(content.species.length)} regions=${String(content.regions.length)} (playable ${String(playableRegions.length)}) spots=${String(content.spots.length)} expeditions=${String(content.expeditions.length)}`,
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
  const regionRows = playableRegions.map((region) => {
    const regionAudits = audits.filter((audit) => String(audit.spot.regionId) === String(region.id))
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
      regionId: String(region.id),
      spots: regionAudits.length,
      species: speciesInRegion.size,
      meanDiversity,
      warningCount,
    }
  })

  lines.push('')
  lines.push('--- region occurrence report ---')
  for (const row of regionRows) {
    lines.push(
      `  ${row.regionId.padEnd(22)} spots=${String(row.spots).padStart(2)} species=${String(row.species).padStart(3)} mean-diversity=${row.meanDiversity.toFixed(2)} warnings=${String(row.warningCount)}`,
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
