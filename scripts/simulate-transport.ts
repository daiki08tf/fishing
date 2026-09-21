import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { obtainableTransportIds } from '../src/content/catalog/references'
import { evaluateAccess } from '../src/domain/access/accessEngine'
import {
  createTransportState,
  grantOwnedTransport,
  type PlayerTransportState,
  type ResolvedTravelOption,
} from '../src/domain/access/Transport'
import { roundTripCostFor } from '../src/domain/economy'
import { asTransportId } from '../src/domain/ids'
import { emptyKnowledgeState } from '../src/domain/knowledge/KnowledgeState'
import { createInitialProgression } from '../src/domain/progression'

export type TransportSimulationCheck = {
  readonly label: string
  readonly ok: boolean
}

export type TransportSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly TransportSimulationCheck[]
  readonly fingerprint: string
}

type Scenario = {
  readonly label: string
  readonly state: PlayerTransportState
}

const stateWith = (available: readonly string[], owned: readonly string[] = []) => {
  let state = createTransportState(available.map(asTransportId))

  for (const id of owned) {
    state = grantOwnedTransport(state, asTransportId(id))
  }

  return state
}

const optionFor = (
  options: readonly ResolvedTravelOption[],
  transportId: string,
): ResolvedTravelOption | null =>
  options.find((option) => String(option.transportId) === transportId) ?? null

export const simulateTransport = (): TransportSimulationResult => {
  const content = loadContentFromDirectory()
  const knowledge = emptyKnowledgeState()
  const scenarios: readonly Scenario[] = [
    { label: 'walk only', state: stateWith(['walk']) },
    { label: 'public transport', state: stateWith(['walk', 'train', 'bus']) },
    {
      label: 'bicycle',
      state: stateWith(['walk', 'train', 'bus'], ['city-bicycle']),
    },
    {
      label: 'motorcycle',
      state: stateWith(['walk', 'train', 'bus'], ['standard-motorcycle']),
    },
    {
      label: 'compact car',
      state: stateWith(['walk', 'train', 'bus'], ['used-compact-car']),
    },
    {
      label: 'SUV',
      state: stateWith(['walk', 'train', 'bus'], ['four-wheel-drive-suv']),
    },
    {
      label: 'rental car',
      state: stateWith(['walk', 'train', 'bus', 'rental-car']),
    },
    {
      label: 'kayak',
      state: stateWith(['walk', 'train', 'bus'], ['recreational-kayak']),
    },
    {
      label: 'rental boat',
      state: stateWith(['walk', 'train', 'bus', 'rental-boat']),
    },
    {
      label: 'owned boat',
      state: stateWith(['walk', 'train', 'bus'], ['owned-boat']),
    },
  ]

  const spot = (id: string) => {
    const found = content.spots.find((entry) => String(entry.id) === id)
    if (found === undefined) {
      throw new Error(`missing transport simulation spot: ${id}`)
    }
    return found
  }

  const evaluate = (scenario: Scenario, spotId: string) =>
    evaluateAccess({
      spot: spot(spotId),
      transports: content.transports,
      playerTransports: scenario.state,
      knowledge,
    })

  const snapshots = scenarios.map((scenario) => {
    const entries = content.spots.map((entry) => {
      const result = evaluateAccess({
        spot: entry,
        transports: content.transports,
        playerTransports: scenario.state,
        knowledge,
      })
      return {
        id: String(entry.id),
        accessible: result.accessible,
        options: result.travelOptions.map((option) => ({
          id: String(option.transportId),
          cost: roundTripCostFor(option),
        })),
      }
    })

    return { label: scenario.label, entries }
  })

  const scenario = (label: string): Scenario => {
    const found = scenarios.find((entry) => entry.label === label)
    if (found === undefined) {
      throw new Error(`missing scenario: ${label}`)
    }
    return found
  }

  const compact = scenario('compact car')
  const suv = scenario('SUV')
  const motorcycle = scenario('motorcycle')
  const rentalCar = scenario('rental car')
  const kayak = scenario('kayak')
  const rentalBoat = scenario('rental boat')
  const ownedBoat = scenario('owned boat')
  const bicycle = scenario('bicycle')

  const upperWithCompact = evaluate(compact, 'upstream-lake')
  const upperOption = optionFor(upperWithCompact.travelOptions, 'used-compact-car')
  const upperWithMotorcycle = evaluate(motorcycle, 'upstream-lake')
  const motorcycleOption = optionFor(upperWithMotorcycle.travelOptions, 'standard-motorcycle')
  const roughWithCompact = evaluate(compact, 'forest-reservoir-arm')
  const roadLakeWithRental = evaluate(rentalCar, 'suburban-road-lake')
  const rentalCarOption = optionFor(roadLakeWithRental.travelOptions, 'rental-car')
  const rentalOffshore = evaluate(rentalBoat, 'offshore-bank-provisional')
  const rentalOption = optionFor(rentalOffshore.travelOptions, 'rental-boat')
  const notOwned = evaluate(
    { label: 'unowned compact', state: stateWith(['walk', 'used-compact-car']) },
    'upstream-lake',
  )

  // 入手手段がある Transport は、どこかの route で実際に使えること（future-only は除く）。
  const fullyEquipped = stateWith(
    content.transports.map((definition) => String(definition.id)),
    content.transports
      .filter((definition) => definition.ownershipModel === 'owned')
      .map((definition) => String(definition.id)),
  )
  const obtainable = obtainableTransportIds(content.transports, content.shopItems)
  const usableSomewhere = new Set(
    content.spots.flatMap((spot) =>
      evaluateAccess({
        spot,
        transports: content.transports,
        playerTransports: fullyEquipped,
        knowledge,
      }).travelOptions.map((option) => String(option.transportId)),
    ),
  )

  // Angler progression is deliberately outside AccessEngine input. Raising it cannot alter
  // the exact same physical-access evaluation.
  const lowLevel = createInitialProgression()
  const highLevel = { ...lowLevel, anglerLevel: 99, totalXp: 9_999_999 }
  const levelComparison = [lowLevel.anglerLevel, highLevel.anglerLevel].map(() =>
    evaluate(scenario('walk only'), 'upstream-lake'),
  )

  const checks: TransportSimulationCheck[] = [
    {
      label: 'Level を上げても transport requirement は突破できない',
      ok:
        !levelComparison[0]?.accessible &&
        levelComparison[0]?.accessible === levelComparison[1]?.accessible,
    },
    {
      label: '自転車は近郊 river access を解放する',
      ok: evaluate(bicycle, 'suburban-cycle-river').accessible,
    },
    {
      label: '所有していない compact car は利用できない',
      ok: !notOwned.accessible,
    },
    {
      label: 'compact car は既存 upper lake access と往復 ¥1,800 を維持する',
      ok:
        upperWithCompact.accessible &&
        upperOption?.minutes === 95 &&
        roundTripCostFor(upperOption) === 1_800,
    },
    {
      label: 'motorcycle は一般道で upper lake に行ける（安い road access）',
      ok:
        upperWithMotorcycle.accessible &&
        motorcycleOption?.minutes === 105 &&
        roundTripCostFor(motorcycleOption) === 3_600,
    },
    {
      label: 'motorcycle は rough-road / offshore を突破できない',
      ok:
        !evaluate(motorcycle, 'forest-reservoir-arm').accessible &&
        !evaluate(motorcycle, 'offshore-bank-provisional').accessible &&
        !evaluate(motorcycle, 'sheltered-kayak-cove').accessible,
    },
    {
      label: 'rental car は一般道 route で使え、レンタル料を 1 回だけ課す',
      ok:
        roadLakeWithRental.accessible &&
        rentalCarOption?.perTripCost === 9_000 &&
        roundTripCostFor(rentalCarOption) === 11_440,
    },
    {
      label: 'rental car は rough-road / water / offshore へ行けない（SUV 相当にしない）',
      ok:
        !evaluate(rentalCar, 'forest-reservoir-arm').accessible &&
        !evaluate(rentalCar, 'sheltered-kayak-cove').accessible &&
        !evaluate(rentalCar, 'offshore-bank-provisional').accessible &&
        !evaluate(rentalCar, 'suburban-cycle-river').accessible,
    },
    {
      label: '入手できる Transport はすべてどこかの route で使える',
      ok: [...obtainable].every((id) => usableSomewhere.has(id)),
    },
    {
      label: '所有している road_access を不足として表示しない',
      ok:
        roughWithCompact.blockedReasons.length > 0 &&
        roughWithCompact.blockedReasons.every(
          (reason) => reason.kind !== 'missing_capability' || reason.capability !== 'road_access',
        ),
    },
    {
      label: 'compact car は rough-road を突破できない',
      ok: !evaluate(compact, 'forest-reservoir-arm').accessible,
    },
    {
      label: 'compact car は offshore を突破できない',
      ok: !evaluate(compact, 'offshore-bank-provisional').accessible,
    },
    {
      label: 'SUV は rough-road に行けるが water access は持たない',
      ok:
        evaluate(suv, 'forest-reservoir-arm').accessible &&
        !evaluate(suv, 'sheltered-kayak-cove').accessible &&
        !evaluate(suv, 'offshore-bank-provisional').accessible,
    },
    {
      label: 'kayak は launch spot に行けるが offshore には行けない',
      ok:
        evaluate(kayak, 'sheltered-kayak-cove').accessible &&
        !evaluate(kayak, 'offshore-bank-provisional').accessible,
    },
    {
      label: 'rental boat は marina から offshore へ行け、レンタル料を課す',
      ok:
        rentalOffshore.accessible &&
        rentalOption?.perTripCost === 28_000 &&
        roundTripCostFor(rentalOption) === 32_000,
    },
    {
      label: 'owned boat は offshore access を提供する',
      ok: evaluate(ownedBoat, 'offshore-bank-provisional').accessible,
    },
    {
      label: '購入価格は Shop と Transport definition で一致する',
      ok: content.shopItems
        .filter((item) => item.grantsTransportId !== undefined)
        .every(
          (item) =>
            content.transportById[String(item.grantsTransportId)]?.purchasePrice === item.price,
        ),
    },
  ]

  const fingerprint = JSON.stringify(snapshots)
  const deterministicFingerprint = JSON.stringify(
    scenarios.map((entry) =>
      content.spots.map((candidate) =>
        evaluateAccess({
          spot: candidate,
          transports: content.transports,
          playerTransports: entry.state,
          knowledge,
        }),
      ),
    ),
  )
  const deterministicFingerprintAgain = JSON.stringify(
    scenarios.map((entry) =>
      content.spots.map((candidate) =>
        evaluateAccess({
          spot: candidate,
          transports: content.transports,
          playerTransports: entry.state,
          knowledge,
        }),
      ),
    ),
  )
  checks.push({
    label: 'accessibility comparison は deterministic',
    ok: deterministicFingerprint === deterministicFingerprintAgain,
  })

  const lines: string[] = ['Transport / Access comparison']
  for (const snapshot of snapshots) {
    const accessible = snapshot.entries.filter((entry) => entry.accessible)
    lines.push(
      `${snapshot.label.padEnd(16)} | ${accessible.length}/${snapshot.entries.length} | ${accessible
        .map((entry) => entry.id)
        .join(', ')}`,
    )
  }
  lines.push('', '--- checks ---')
  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push(
    '',
    allOk ? 'OK: transport access is healthy' : 'FAILED: transport access has problems',
  )
  return { exitCode: allOk ? 0 : 1, lines, checks, fingerprint }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateTransport()
    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }
    process.exitCode = result.exitCode
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
