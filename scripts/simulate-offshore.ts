import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { evaluateAccess } from '../src/domain/access/accessEngine'
import type { PlayerTransportState, TransportDefinition } from '../src/domain/access/Transport'
import {
  DEFAULT_DEPTH_TUNING,
  depthToFightDistanceM,
  resolveDeployment,
  resolveDepthCapability,
  resolveFishingPlatform,
  resolveMarineReadiness,
  SEA_STATES,
  type FishingPlatform,
} from '../src/domain/depth'
import type { EncounterCandidate } from '../src/domain/encounter/encounterEngine'
import type { EnvironmentSnapshot } from '../src/domain/environment'
import { searchWater } from '../src/domain/environment/fishFinder'
import { FishingEngine, isTerminalPhase } from '../src/domain/fishing'
import type { GearItem, LineDefinition, ReelDefinition } from '../src/domain/gear/Gear'
import { asFishingSpotId, asGearId } from '../src/domain/ids'
import { emptyKnowledgeState } from '../src/domain/knowledge/KnowledgeState'
import type { FishingMethod } from '../src/domain/method/FishingMethod'
import { methodAcceptsOffering, methodSupportsPlatform } from '../src/domain/method/FishingMethod'
import {
  addContactTrust,
  applyCharterTripOutcome,
  claimEligibleRewards,
  createInitialTradeState,
  isContactKnown,
  trustOf,
} from '../src/domain/trade'
import { SeededRandomSource } from '../src/domain/rng/SeededRandomSource'
import type { Loadout } from '../src/domain/tackle/Loadout'
import { resolveTackle } from '../src/domain/tackle/resolveTackle'
import type { FishingSpot } from '../src/domain/world/FishingSpot'
import {
  createInitialWorld,
  discoverSpotFromContact,
  isSpotKnown,
} from '../src/domain/world/worldSession'
import { runFishingToTerminal } from './simulate-fishing'

/**
 * Phase 17E — Offshore の一本通しシミュレータ。
 *
 * 17A〜17D で作った Depth / Method presentation / Fish Finder / Charter / Captain の
 * 各 Domain 断片が、実 Content の上で実際に繋がっていることを確認する。
 * 既存の simulate-trade-network.ts / simulate-world-expansion.ts と同じ形式
 * （PASS/FAIL の配列 + 決定論的 seed）で作り、`npm run check` に組み込む。
 */

export type OffshoreCheck = {
  readonly label: string
  readonly ok: boolean
}

const push = (checks: OffshoreCheck[], label: string, ok: boolean): void => {
  checks.push({ label, ok })
}

const content = loadContentFromDirectory()

const gear = (id: string): GearItem => {
  const item = content.gearById[id]
  if (item === undefined) {
    throw new Error(`simulate-offshore: missing gear content ${id}`)
  }
  return item
}

const spot = (id: string): FishingSpot => {
  const found = content.spots.find((entry) => String(entry.id) === id)
  if (found === undefined) {
    throw new Error(`simulate-offshore: missing spot content ${id}`)
  }
  return found
}

const method = (id: string): FishingMethod => {
  const found = content.methods.find((entry) => entry.id === id)
  if (found === undefined) {
    throw new Error(`simulate-offshore: missing method content ${id}`)
  }
  return found
}

const transport = (id: string): TransportDefinition => {
  const found = content.transports.find((entry) => String(entry.id) === id)
  if (found === undefined) {
    throw new Error(`simulate-offshore: missing transport content ${id}`)
  }
  return found
}

const fullTransportState = (transports: readonly TransportDefinition[]): PlayerTransportState => ({
  availableTransportIds: transports.map((entry) => entry.id),
  ownedTransportIds: transports.map((entry) => entry.id),
})

/*
 * 中立の Environment（Search / SeaState の入力に固定値が要る箇所で使う）。
 * 本物の Environment 解決（気候・天候・潮）は environment ドメインのテストが持つので、
 * ここは Fish Finder / SeaState の入出力を検証するための最小スタブでよい。
 */
const NEUTRAL_ENVIRONMENT: EnvironmentSnapshot = {
  date: '2026-06-01',
  month: 6,
  season: 'summer',
  timeOfDay: 'daytime',
  weather: 'clear',
  tide: 'rising',
  water: { kind: 'saltwater', temperatureC: 22, clarity: 0.8, flow: 'moderate', wind: 'calm' },
}

const encountersFor = (targetSpot: FishingSpot): readonly EncounterCandidate[] =>
  targetSpot.fishTable.flatMap((occurrence) => {
    const species = content.speciesById[String(occurrence.speciesId)]
    return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
  })

/* -------------------------------------------------------------------------- */
/* 1. World summary（global + region）                                        */
/* -------------------------------------------------------------------------- */

const OFFSHORE_METHOD_IDS = [
  'offshore_casting',
  'vertical_jigging',
  'tai_rubber',
  'live_bait_drift',
  'trolling',
] as const

export const summarizeOffshoreWorld = (): { readonly lines: readonly string[] } => {
  const lines: string[] = []

  const isOffshoreSpot = (candidate: FishingSpot): boolean =>
    candidate.environment === 'offshore' ||
    candidate.access.some(
      (requirement) => requirement.kind === 'capability' && requirement.capability === 'offshore',
    )
  const isBoatSpot = (candidate: FishingSpot): boolean =>
    candidate.access.some(
      (requirement) =>
        requirement.kind === 'capability' && requirement.capability === 'boat_required',
    )

  const offshoreSpots = content.spots.filter(isOffshoreSpot)
  const hiddenOffshoreSpots = offshoreSpots.filter((candidate) => candidate.visibility === 'hidden')
  const boatTransports = content.transports.filter((entry) => entry.boatCapability !== 'none')
  const charterTransports = content.transports.filter(
    (entry) => entry.operatorContactId !== undefined,
  )
  const marineContacts = content.contacts.filter((entry) =>
    (['captain', 'guide'] as const).includes(entry.type as 'captain' | 'guide'),
  )
  const offshoreMethods = content.methods.filter((entry) =>
    (OFFSHORE_METHOD_IDS as readonly string[]).includes(entry.id),
  )
  const fishFinders = content.gear.filter(
    (entry) => entry.category === 'electronics' && entry.kind === 'fish_finder',
  )

  lines.push('--- offshore world summary (global) ---')
  lines.push(
    [
      `boatSpots=${String(content.spots.filter(isBoatSpot).length)}`,
      `offshoreSpots=${String(offshoreSpots.length)}`,
      `hiddenOffshoreSpots=${String(hiddenOffshoreSpots.length)}`,
      `boatTransports=${String(boatTransports.length)}`,
      `charterServices=${String(charterTransports.length)}`,
      `marineContacts=${String(marineContacts.length)}`,
      `offshoreMethods=${String(offshoreMethods.length)}/${String(OFFSHORE_METHOD_IDS.length)}`,
      `fishFinders=${String(fishFinders.length)}`,
    ].join(' '),
  )

  lines.push('--- offshore world summary (per region) ---')
  for (const region of [...content.regions].sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  )) {
    if (region.stage !== 'playable') {
      continue
    }

    const regionId = String(region.id)
    const regionSpots = content.spots.filter((entry) => String(entry.regionId) === regionId)
    const regionBoatSpots = regionSpots.filter(isBoatSpot)
    const regionHiddenBoatSpots = regionBoatSpots.filter((entry) => entry.visibility === 'hidden')
    const depths = regionBoatSpots.flatMap((entry) =>
      entry.depth?.depthRangeM === undefined ? [] : [entry.depth.depthRangeM],
    )
    const minDepth = depths.length === 0 ? null : Math.min(...depths.map((range) => range.min))
    const maxDepth = depths.length === 0 ? null : Math.max(...depths.map((range) => range.max))
    const regionCaptains = content.contacts.filter(
      (entry) => String(entry.regionId) === regionId && entry.type !== 'rental_staff',
    )

    if (regionBoatSpots.length === 0) {
      continue
    }

    lines.push(
      `  ${regionId.padEnd(20)} boatSpots=${String(regionBoatSpots.length)}(hidden ${String(regionHiddenBoatSpots.length)}) depth=${minDepth === null ? '—' : `${String(minDepth)}-${String(maxDepth)}m`} captains=${String(regionCaptains.length)}`,
    )
  }

  return { lines }
}

/* -------------------------------------------------------------------------- */
/* 2. Depth simulation（light / medium / heavy jigging setups）               */
/* -------------------------------------------------------------------------- */

const depthCapabilityFor = (
  reelId: string,
  lineId: string,
  offeringId: string,
  platform: FishingPlatform,
): ReturnType<typeof resolveDepthCapability> => {
  const reel = gear(reelId) as ReelDefinition & { readonly category: 'reel' }
  const line = gear(lineId) as LineDefinition & { readonly category: 'line' }
  const offering = gear(offeringId)

  if (offering.category !== 'lure' && offering.category !== 'bait') {
    throw new Error(`simulate-offshore: ${offeringId} is not an offering`)
  }

  return resolveDepthCapability({
    reel,
    line,
    offering,
    platform,
    tuning: DEFAULT_DEPTH_TUNING,
  })
}

export const checkDepthSimulation = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const izuOffshore = spot('izu-offshore-grounds')
  const zones = izuOffshore.fishingZones ?? []
  const bottomZone = zones.find((zone) => zone.id === 'bottom')

  if (bottomZone === undefined) {
    push(checks, 'depth simulation spot has a bottom zone', false)
    return checks
  }

  const light = depthCapabilityFor(
    'daiva-certex-8000hg',
    'daiva-light-pe-12kg',
    'major-crest-jig-60-natural',
    'offshore_boat',
  )
  const medium = depthCapabilityFor(
    'daiva-certex-14000hg',
    'daiva-light-pe-25kg',
    'lure-jig-big',
    'offshore_boat',
  )
  const heavy = depthCapabilityFor(
    'blue-horizon-abysspower-30000pg',
    'daiva-light-pe-50kg',
    'blue-horizon-deep-jig-128-flash',
    'offshore_boat',
  )

  push(
    checks,
    '軽量タックルは中量・重量タックルより到達水深が浅い',
    light.maxDepthM < medium.maxDepthM && medium.maxDepthM < heavy.maxDepthM,
  )
  push(
    checks,
    '到達水深は無限にならない（hard cap 以内）',
    heavy.maxDepthM <= DEFAULT_DEPTH_TUNING.maxHardCapM,
  )
  push(
    checks,
    '全タックルで到達水深が正の値',
    [light, medium, heavy].every((c) => c.maxDepthM > 0),
  )

  // 20 / 50 / 100 / 150m+ と slow / moderate / strong の組み合わせで、
  // 「浅場は軽量でも安定・深場は重量ほど安定（spread が小さい）」を確認する。
  const targets: readonly [string, number][] = [
    ['surface', 8],
    ['mid', 30],
    ['bottom', 90],
  ]
  let heavyBeatsLightDeep = 0
  let trials = 0

  for (const drift of ['slow', 'moderate', 'strong'] as const) {
    for (const [zoneId] of targets) {
      const zoneExists = zones.some((zone) => zone.id === zoneId)
      if (!zoneExists) {
        continue
      }

      trials += 1
      const seed = `offshore-depth:${zoneId}:${drift}`
      const lightSpread = spreadOf(zones, zoneId, light, seed, drift)
      const heavySpread = spreadOf(zones, zoneId, heavy, seed, drift)

      if (zoneId === 'bottom' && heavySpread <= lightSpread) {
        heavyBeatsLightDeep += 1
      }
    }
  }

  push(
    checks,
    '深場では重量タックルの方が軽量タックルよりブレが小さい（control が効く）',
    heavyBeatsLightDeep > 0 && trials > 0,
  )

  return checks
}

/** 30 試行の平均ブレ幅（|actual - target| の平均）。resolveDeployment の決定論性はテスト側で別途確認する。 */
const spreadOf = (
  zones: FishingSpot['fishingZones'],
  targetZoneId: string,
  capability: ReturnType<typeof resolveDepthCapability>,
  seedBase: string,
  drift: 'slow' | 'moderate' | 'strong',
): number => {
  // resolveDriftStrength は Spot.current から来る抽象値。ここでは直接 DriftStrength を渡す。
  const driftStrength = drift === 'slow' ? 'slow' : drift === 'moderate' ? 'moderate' : 'fast'
  let total = 0
  const trials = 20

  for (let index = 0; index < trials; index += 1) {
    const random = new SeededRandomSource(`${seedBase}:${String(index)}`)
    const result = resolveDeployment({
      zones: zones ?? [],
      targetZoneId,
      capability,
      random,
      drift: driftStrength,
    })

    if (result.reachable) {
      total += Math.abs(result.actualDepthM - result.targetDepthM)
    }
  }

  return total / trials
}

/* -------------------------------------------------------------------------- */
/* 3. Sonar simulation（basic / mid / advanced Fish Finder）                  */
/* -------------------------------------------------------------------------- */

export const checkSonarSimulation = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const deepSpot = spot('sagami-bay-offshore')
  const species = deepSpot.fishTable.flatMap((occurrence) => {
    const found = content.speciesById[String(occurrence.speciesId)]
    return found === undefined ? [] : [found]
  })
  const zones = deepSpot.fishingZones ?? []

  const basic = gear('basic-fish-finder')
  const mid = gear('mid-fish-finder')
  const advanced = gear('advanced-fish-finder')

  if (
    basic.category !== 'electronics' ||
    mid.category !== 'electronics' ||
    advanced.category !== 'electronics'
  ) {
    push(checks, 'fish finder gear content resolves', false)
    return checks
  }

  const searchWith = (finder: { readonly detectionDepthM: number; readonly accuracy: number }) =>
    searchWater({
      environment: NEUTRAL_ENVIRONMENT,
      regionId: String(deepSpot.regionId),
      spotId: String(deepSpot.id),
      time: { year: 2026, month: 6, day: 1, hour: 10, minute: 0 },
      species,
      finder,
      depthZones: zones,
      spotDepthRangeM: deepSpot.depth?.depthRangeM,
      knowledgeScore: 0,
    })

  const basicResult = searchWith(basic)
  const advancedResult = searchWith(advanced)
  const noFinderResult = searchWith(null as never)

  push(
    checks,
    'basic finder の検知深度を超える Zone は depthSignals に出ない',
    basicResult.depthSignals !== null &&
      basicResult.depthSignals.every((signal) => signal.rangeM.min < basic.detectionDepthM),
  )
  push(
    checks,
    'advanced finder は basic finder より多くの Zone を捉える（検知深度が深い）',
    (advancedResult.depthSignals?.length ?? 0) >= (basicResult.depthSignals?.length ?? 0),
  )
  push(
    checks,
    'Fish Finder 無しでも Search Water 自体はできる（bite に必須ではない）',
    noFinderResult.sign !== undefined && noFinderResult.depthSignals === null,
  )
  push(
    checks,
    '同じ seed（regionId/spotId/date/time/position）なら結果は決定論的',
    JSON.stringify(searchWith(basic)) === JSON.stringify(basicResult),
  )
  push(
    checks,
    '反応は魚種名を明かさない（speciesIds は既存の Search Sign 由来のみ、depthSignals には無い）',
    !JSON.stringify(basicResult.depthSignals).includes('"speciesId'),
  )

  return checks
}

/* -------------------------------------------------------------------------- */
/* 4. Marine readiness                                                        */
/* -------------------------------------------------------------------------- */

export const checkMarineReadiness = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []

  push(
    checks,
    'shore は海況を問わず常に OK',
    SEA_STATES.every((state) => resolveMarineReadiness('shore', state).ok),
  )
  push(checks, 'kayak は穏やかな海況でのみ OK', resolveMarineReadiness('kayak', 'calm').ok)
  push(
    checks,
    'kayak は荒れた海況では出艇を見合わせる',
    !resolveMarineReadiness('kayak', 'rough').ok,
  )
  push(
    checks,
    'nearshore_boat は荒れた海況では出艇を見合わせる',
    !resolveMarineReadiness('nearshore_boat', 'rough').ok,
  )
  push(
    checks,
    'offshore_boat はどの海況でも出艇できる（大型船の想定）',
    SEA_STATES.every((state) => resolveMarineReadiness('offshore_boat', state).ok),
  )

  return checks
}

/* -------------------------------------------------------------------------- */
/* 5. Method playability（5 methods x offering/platform/engine loop）         */
/* -------------------------------------------------------------------------- */

type MethodFixture = {
  readonly methodId: string
  readonly validOfferingId: string
  readonly invalidOfferingId: string
  readonly expectedPlatforms: readonly string[]
}

const METHOD_FIXTURES: readonly MethodFixture[] = [
  {
    methodId: 'offshore_casting',
    validOfferingId: 'blue-horizon-popper-104-flash',
    invalidOfferingId: 'blue-horizon-live-baitfish',
    expectedPlatforms: ['kayak', 'nearshore_boat', 'offshore_boat'],
  },
  {
    methodId: 'vertical_jigging',
    validOfferingId: 'lure-jig-big',
    invalidOfferingId: 'major-crest-tairubber-40',
    expectedPlatforms: ['kayak', 'nearshore_boat', 'offshore_boat'],
  },
  {
    methodId: 'tai_rubber',
    validOfferingId: 'major-crest-tairubber-40',
    invalidOfferingId: 'lure-jig-big',
    expectedPlatforms: ['kayak', 'nearshore_boat', 'offshore_boat'],
  },
  {
    methodId: 'live_bait_drift',
    validOfferingId: 'blue-horizon-live-baitfish',
    invalidOfferingId: 'lure-jig-big',
    expectedPlatforms: ['kayak', 'nearshore_boat', 'offshore_boat'],
  },
  {
    methodId: 'trolling',
    validOfferingId: 'evergreen-field-minnow-99-natural',
    invalidOfferingId: 'lure-jig-big',
    expectedPlatforms: ['nearshore_boat', 'offshore_boat'],
  },
] as const

const GENERIC_OFFSHORE_LOADOUT = {
  rodId: 'blue-horizon-offshore-x-211mhm',
  reelId: 'daiva-certex-14000hg',
  lineId: 'daiva-light-pe-25kg',
  leaderId: 'blue-horizon-fluoro-leader-12kg',
  hookId: 'blue-horizon-assist-series-8',
} as const

const offeringOf = (
  id: string,
): {
  readonly category: 'lure' | 'bait'
  readonly lureType?: string
  readonly baitType?: string
} => {
  const item = gear(id)
  if (item.category === 'lure') {
    return { category: 'lure', lureType: item.lureType }
  }
  if (item.category === 'bait') {
    return { category: 'bait', baitType: item.baitType }
  }
  throw new Error(`simulate-offshore: ${id} is not an offering`)
}

export const checkMethodPlayability = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const izuOffshore = spot('izu-offshore-grounds')

  for (const fixture of METHOD_FIXTURES) {
    const fishingMethod = method(fixture.methodId)

    push(
      checks,
      `[${fixture.methodId}] valid offering is accepted`,
      methodAcceptsOffering(fishingMethod, offeringOf(fixture.validOfferingId)),
    )
    push(
      checks,
      `[${fixture.methodId}] invalid offering is rejected`,
      !methodAcceptsOffering(fishingMethod, offeringOf(fixture.invalidOfferingId)),
    )
    push(
      checks,
      `[${fixture.methodId}] declared platforms match content`,
      fixture.expectedPlatforms.every((platform) =>
        methodSupportsPlatform(fishingMethod, platform),
      ) && !methodSupportsPlatform(fishingMethod, 'shore'),
    )

    // depth behavior + encounter + Text Battle + landing: 実際に Engine を回す。
    const loadout: Loadout = {
      rodId: asGearId(GENERIC_OFFSHORE_LOADOUT.rodId),
      reelId: asGearId(GENERIC_OFFSHORE_LOADOUT.reelId),
      lineId: asGearId(GENERIC_OFFSHORE_LOADOUT.lineId),
      leaderId: asGearId(GENERIC_OFFSHORE_LOADOUT.leaderId),
      hookId: asGearId(GENERIC_OFFSHORE_LOADOUT.hookId),
      offeringId: asGearId(fixture.validOfferingId),
      methodId: fixture.methodId,
    }
    const tackle = resolveTackle({ loadout, gear: content.gear, methods: content.methods })
    const capability = depthCapabilityFor(
      GENERIC_OFFSHORE_LOADOUT.reelId,
      GENERIC_OFFSHORE_LOADOUT.lineId,
      fixture.validOfferingId,
      'offshore_boat',
    )
    const zones = izuOffshore.fishingZones ?? []
    const targetZone = zones.find((zone) => zone.id === 'mid') ?? zones[0]

    if (targetZone === undefined || tackle === null) {
      push(checks, `[${fixture.methodId}] engine loop reaches a terminal phase`, false)
      continue
    }

    const random = new SeededRandomSource(`offshore-method:${fixture.methodId}`)
    const deployment = resolveDeployment({
      zones,
      targetZoneId: targetZone.id,
      capability,
      random,
      drift: 'slow',
    })

    let reachedFighting = false
    let landedAtLeastOnce = false

    for (let trial = 0; trial < 8; trial += 1) {
      const engine = new FishingEngine({
        encounters: encountersFor(izuOffshore),
        seed: `offshore-method:${fixture.methodId}:${String(trial)}`,
        spotId: asFishingSpotId(izuOffshore.id),
        playerModifiers: tackle.playerModifiers,
        encounterProfile: tackle.encounterProfile,
        initialFightDistanceM: deployment.reachable
          ? depthToFightDistanceM(deployment.actualDepthM)
          : 20,
      })

      engine.cast()
      const steps = runFishingToTerminal(engine, 'balanced')
      const finalPhase = engine.snapshot().phase

      if (
        steps > 0 &&
        (finalPhase === 'FIGHTING' || finalPhase === 'LANDING' || finalPhase === 'LANDED')
      ) {
        reachedFighting = true
      }
      if (finalPhase === 'LANDED') {
        landedAtLeastOnce = true
      }
    }

    push(
      checks,
      `[${fixture.methodId}] depth deployment is reachable from mid zone`,
      deployment.reachable,
    )
    push(checks, `[${fixture.methodId}] can reach Text Battle (FIGHTING)`, reachedFighting)
    push(checks, `[${fixture.methodId}] can land a catch across trials`, landedAtLeastOnce)
  }

  return checks
}

/* -------------------------------------------------------------------------- */
/* 6. Existing shore regression（CRITICAL — 岸釣りの Core Loop は変わらない）  */
/* -------------------------------------------------------------------------- */

export const checkShoreRegression = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const shoreSpot = spot('arakawa-lower')

  push(
    checks,
    '岸 Spot は depth-only zone を持たない（cast zone のまま）',
    (shoreSpot.fishingZones ?? []).every((zone) => zone.castDistanceM !== undefined),
  )

  const tackle = resolveTackle({
    loadout: {
      rodId: asGearId('starter-rod'),
      reelId: asGearId('starter-reel'),
      lineId: asGearId('starter-line'),
      leaderId: asGearId('starter-leader'),
      hookId: asGearId('starter-hook'),
      offeringId: asGearId('starter-lure'),
      methodId: 'lure_casting',
    },
    gear: content.gear,
    methods: content.methods,
  })

  let reachedTerminal = false
  for (let trial = 0; trial < 6 && !reachedTerminal; trial += 1) {
    const engine = new FishingEngine({
      encounters: encountersFor(shoreSpot),
      seed: `shore-regression:${String(trial)}`,
      spotId: asFishingSpotId(shoreSpot.id),
      ...(tackle === null
        ? {}
        : { playerModifiers: tackle.playerModifiers, encounterProfile: tackle.encounterProfile }),
    })

    engine.cast()
    runFishingToTerminal(engine, 'balanced')
    if (isTerminalPhase(engine.snapshot().phase)) {
      reachedTerminal = true
    }
  }

  push(
    checks,
    '岸釣り Core Loop（CAST→BITE→HOOK→Battle→LAND）は Boat 無しで最後まで進む',
    reachedTerminal,
  )

  return checks
}

/* -------------------------------------------------------------------------- */
/* 7. Offshore core loop                                                      */
/* -------------------------------------------------------------------------- */

export const checkOffshoreCoreLoop = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const boat = transport('charter-boat')
  const platform = resolveFishingPlatform(boat)

  push(
    checks,
    'charter-boat は offshore_boat platform を解決する',
    platform.platform === 'offshore_boat',
  )

  const offshoreSpot = spot('sagami-bay-offshore')
  const access = evaluateAccess({
    spot: offshoreSpot,
    transports: content.transports,
    playerTransports: fullTransportState(content.transports),
    knowledge: emptyKnowledgeState(),
    permitsEnabled: true,
    permits: [],
  })

  push(checks, 'offshore Spot は boat capability があれば access できる', access.accessible)

  return checks
}

/* -------------------------------------------------------------------------- */
/* 8. Captain loop（introduce → charter → Trust → intel → discover → access） */
/* -------------------------------------------------------------------------- */

export const checkCaptainLoop = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const buyer = content.buyers.find((entry) => String(entry.id) === 'fish-wholesaler')
  const captain = content.contacts.find((entry) => String(entry.id) === 'captain-taro')
  const boat = transport('charter-boat')
  const hiddenSpot = content.spots.find(
    (entry) => String(entry.id) === 'sagami-hidden-current-edge',
  )

  if (buyer === undefined || captain === undefined || hiddenSpot === undefined) {
    push(checks, 'captain loop fixtures resolve', false)
    return checks
  }

  push(
    checks,
    'Captain は初期状態では未紹介（isContactKnown=false）',
    !isContactKnown(captain, content.contactRewards, []),
  )

  // Buyer の Trust が閾値に達し、introduce_contact を claim する。
  let trade = createInitialTradeState()
  trade = addContactTrust(trade, buyer.id, 30)
  const introClaim = claimEligibleRewards(trade, buyer.id, content.contactRewards)
  trade = introClaim.trade

  push(
    checks,
    'Buyer Trust が閾値に達すると introduce_contact が claim される',
    introClaim.newlyClaimed.some((reward) => reward.kind === 'introduce_contact'),
  )
  push(
    checks,
    'claim 後は isContactKnown が true になる（新しい永続 state は使わない）',
    isContactKnown(captain, content.contactRewards, trade.claimedRewardIds),
  )

  // チャーター釣行を複数回完了する（ボウズを含む）。Trust が積み上がる。
  let discoveredWorld = createInitialWorld()
  let claimedDiscoverSpot = false

  for (let trip = 0; trip < 10; trip += 1) {
    const catches = trip % 3 === 0 ? 0 : 2 // ボウズも混ぜる
    const outcome = applyCharterTripOutcome(trade, boat, catches)
    trade = outcome.trade

    const claim = claimEligibleRewards(trade, captain.id, content.contactRewards)
    trade = claim.trade

    for (const reward of claim.newlyClaimed) {
      if (reward.kind === 'discover_spot' && String(reward.targetId) === String(hiddenSpot.id)) {
        discoveredWorld = discoverSpotFromContact(discoveredWorld, hiddenSpot.id)
        claimedDiscoverSpot = true
      }
    }
  }

  push(checks, 'Charter 完了の積み重ねで Captain Trust が上がる', trustOf(trade, captain.id) > 0)
  push(checks, '十分な Trust で discover_spot が claim される', claimedDiscoverSpot)
  push(
    checks,
    'discover_spot 後は isSpotKnown が true（Map に出る）',
    isSpotKnown(discoveredWorld, hiddenSpot),
  )

  // Discovery != Access: 知っているだけでは、Access（relationship Trust）を別途満たす必要がある。
  const lowTrustAccess = evaluateAccess({
    spot: hiddenSpot,
    transports: content.transports,
    playerTransports: fullTransportState(content.transports),
    knowledge: { ...emptyKnowledgeState(), spots: { [String(hiddenSpot.id)]: 100 } },
    permitsEnabled: true,
    permits: [],
    contactTrust: { [String(captain.id)]: 0 },
  })
  const highTrustAccess = evaluateAccess({
    spot: hiddenSpot,
    transports: content.transports,
    playerTransports: fullTransportState(content.transports),
    knowledge: { ...emptyKnowledgeState(), spots: { [String(hiddenSpot.id)]: 100 } },
    permitsEnabled: true,
    permits: [],
    contactTrust: { [String(captain.id)]: trustOf(trade, captain.id) },
  })

  push(
    checks,
    'Trust が低いままでは Hidden Spot に Access できない（Known != reachable）',
    !lowTrustAccess.accessible,
  )
  push(checks, '十分な Trust が積み上がると Access できる', highTrustAccess.accessible)

  return checks
}

/* -------------------------------------------------------------------------- */
/* 9. Skunk loop（ボウズでも釣行は無駄にならない）                             */
/* -------------------------------------------------------------------------- */

export const checkSkunkLoop = (): readonly OffshoreCheck[] => {
  const checks: OffshoreCheck[] = []
  const boat = transport('charter-boat')
  const trade = createInitialTradeState()
  const outcome = applyCharterTripOutcome(trade, boat, 0)

  push(checks, 'ボウズ（釣果 0）でも Base Trust は入る', outcome.trustGain > 0)
  push(
    checks,
    '釣果ありの釣行はボウズより Trust が高い',
    applyCharterTripOutcome(trade, boat, 3).trustGain > outcome.trustGain,
  )

  return checks
}

/* -------------------------------------------------------------------------- */
/* 10. Economy balance（PROVISIONAL）                                         */
/* -------------------------------------------------------------------------- */

export const checkEconomyBalance = (): {
  readonly lines: readonly string[]
  readonly checks: readonly OffshoreCheck[]
} => {
  const checks: OffshoreCheck[] = []
  const lines: string[] = []
  const kayak = transport('recreational-kayak')
  const rental = transport('rental-boat')
  const smallOwned = transport('small-owned-boat')
  const charter = transport('charter-boat')
  const ownedBig = transport('owned-boat')
  const MONTHLY_FREE_CASH = 120000

  lines.push('--- boat economy (PROVISIONAL) ---')
  lines.push(
    [
      `kayak purchase=¥${String(kayak.purchasePrice)}`,
      `small-owned purchase=¥${String(smallOwned.purchasePrice)}`,
      `owned-boat purchase=¥${String(ownedBig.purchasePrice)}`,
      `rental per-trip=¥${String(rental.rentalCost)}`,
      `charter per-trip=¥${String(charter.rentalCost)}`,
    ].join(' '),
  )

  push(
    checks,
    'kayak は月の自由資金の数か月分で買える',
    (kayak.purchasePrice ?? 0) <= MONTHLY_FREE_CASH * 3,
  )
  push(
    checks,
    'small owned boat は kayak より高く、大型 owned boat より安い（中間の段階）',
    (kayak.purchasePrice ?? 0) < (smallOwned.purchasePrice ?? 0) &&
      (smallOwned.purchasePrice ?? 0) < (ownedBig.purchasePrice ?? 0),
  )
  push(
    checks,
    'charter は 1 回あたり rental より高い（船長のサービス料）',
    (charter.rentalCost ?? 0) > (rental.rentalCost ?? 0),
  )
  push(
    checks,
    'charter は 1 回の釣行が月の自由資金の一部で済む（所有無しで沖に出られる）',
    (charter.rentalCost ?? 0) < MONTHLY_FREE_CASH * 0.6,
  )
  push(
    checks,
    'owned boat は rental より航続距離が長い（所有の価値がある）',
    (ownedBig.maxRangeKm ?? 0) > (rental.maxRangeKm ?? 0),
  )
  push(
    checks,
    'small owned boat は offshore capability を持たない（大型船で埋め合わせる棲み分け）',
    smallOwned.boatCapability !== 'offshore' && ownedBig.boatCapability === 'offshore',
  )

  return { lines, checks }
}

/* -------------------------------------------------------------------------- */
/* main                                                                        */
/* -------------------------------------------------------------------------- */

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const summary = summarizeOffshoreWorld()
    for (const line of summary.lines) {
      process.stdout.write(`${line}\n`)
    }

    const sections: readonly [string, readonly OffshoreCheck[]][] = [
      ['depth simulation', checkDepthSimulation()],
      ['sonar simulation', checkSonarSimulation()],
      ['marine readiness', checkMarineReadiness()],
      ['method playability', checkMethodPlayability()],
      ['shore regression (critical)', checkShoreRegression()],
      ['offshore core loop', checkOffshoreCoreLoop()],
      ['captain loop', checkCaptainLoop()],
      ['skunk loop', checkSkunkLoop()],
    ]

    let allOk = true
    for (const [label, checks] of sections) {
      process.stdout.write(`\n--- ${label} ---\n`)
      for (const check of checks) {
        process.stdout.write(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}\n`)
        if (!check.ok) {
          allOk = false
        }
      }
    }

    const economy = checkEconomyBalance()
    process.stdout.write('\n')
    for (const line of economy.lines) {
      process.stdout.write(`${line}\n`)
    }
    for (const check of economy.checks) {
      process.stdout.write(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}\n`)
      if (!check.ok) {
        allOk = false
      }
    }

    process.stdout.write(
      `\n${allOk ? 'OK: offshore simulation is healthy' : 'FAILED: offshore simulation has problems'}\n`,
    )
    process.exitCode = allOk ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
