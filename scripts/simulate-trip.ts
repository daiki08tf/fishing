import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import { resolveCatch } from '../src/domain/catch'
import { emptyCodexState } from '../src/domain/codex'
import type { EncounterCandidate } from '../src/domain/encounter/encounterEngine'
import { FishingEngine, isTerminalPhase, type FishingEvent } from '../src/domain/fishing'
import type { FishIndividual } from '../src/domain/fish/FishIndividual'
import { emptyKnowledgeState } from '../src/domain/knowledge/KnowledgeState'
import { spotKnowledgeScore } from '../src/domain/knowledge/spotKnowledge'
import { createInitialProgression } from '../src/domain/progression'
import {
  formatDuration,
  formatWorldTime,
  isWeekend,
  type WorldTime,
} from '../src/domain/world/WorldTime'
import {
  arriveAtSpot,
  arriveHome,
  createInitialWorld,
  leaveForSpot,
  leaveSpot,
  recordFishingAttempt,
} from '../src/domain/world/worldSession'
import { chooseCommand } from './simulate-fishing'
import { createInitialTransportState } from '../src/domain/access/Transport'
import { asTransportId } from '../src/domain/ids'

/**
 * 「土曜の朝に家を出て、釣りをして、帰ってくる」を 1 本通す。
 *
 *   HOME 06:00 → 電車 → Spot 到着 → 釣り ×N → 帰宅 → HOME
 *
 * seed 固定で再現できる。Domain のループが現実に回ることを確認するためのもの。
 *
 * 使い方:
 *   npm run simulate:trip
 *   npm run simulate:trip -- --spot tokyo-bay-shore --attempts 3
 */

/** 1 回の釣りが終わったことを示すイベント。 */
const END_EVENTS: readonly FishingEvent[] = [
  'LANDED',
  'HOOK_MISSED',
  'HOOK_ESCAPE',
  'LINE_BREAK',
  'NO_BITE',
]

export type TripSimulationOptions = {
  readonly seed: string
  readonly spotId?: string
  readonly attempts: number
}

export type TripSimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
  readonly checks: readonly { readonly label: string; readonly ok: boolean }[]
}

type TripRun = {
  readonly lines: readonly string[]
  /** 再現性の比較に使う、結果を要約した文字列。 */
  readonly fingerprint: string
  readonly catches: number
  readonly attempts: number
  readonly xpGained: number
  readonly level: number
  readonly spotKnowledge: number
  readonly startedMinutes: number
  readonly arrivalMinutes: number
  readonly departureMinutes: number
  readonly endedMinutes: number
}

/** 釣り 1 回を最後まで進める。 */
const runOneAttempt = (options: {
  readonly encounters: readonly EncounterCandidate[]
  readonly seed: string
}): { readonly phase: string; readonly individual: FishIndividual | null } => {
  const engine = new FishingEngine({ encounters: options.encounters, seed: options.seed })
  let guard = 0

  while (guard < 4000) {
    const snapshot = engine.snapshot()
    const command = chooseCommand('balanced', snapshot)
    engine.dispatch(command)
    const result = engine.tick()
    guard += 1

    if (result.events.some((event) => END_EVENTS.includes(event))) {
      break
    }

    if (isTerminalPhase(result.snapshot.phase)) {
      break
    }
  }

  const snapshot = engine.snapshot()
  const individual = snapshot.fish?.individual ?? null

  return {
    phase: snapshot.phase,
    individual,
  }
}

const minutesOf = (time: WorldTime): number => (time.day * 24 + time.hour) * 60 + time.minute

const runTrip = (options: TripSimulationOptions): TripRun => {
  const content = loadContentFromDirectory()
  const spot =
    options.spotId === undefined
      ? content.spots.find((entry) => String(entry.id) === 'tokyo-urban-canal')
      : content.spots.find((entry) => String(entry.id) === options.spotId)

  if (spot === undefined) {
    throw new Error(`unknown spot: ${String(options.spotId)}`)
  }

  let world = createInitialWorld()
  let knowledge = emptyKnowledgeState()
  let codex = emptyCodexState()
  let progression = createInitialProgression()
  const playerTransports = createInitialTransportState(asTransportId)

  const lines: string[] = []
  const log = (message: string): void => {
    lines.push(`${formatWorldTime(world.time)} | ${message}`)
  }

  const startedMinutes = minutesOf(world.time)
  log(`HOME（${isWeekend(world.time) ? '休日' : '平日'}）`)

  log(`出発（${spot.name} へ）`)

  const left = leaveForSpot({
    context: { world, knowledge },
    spot,
    transports: content.transports,
    playerTransports,
  })

  if (!left.ok) {
    throw new Error(`could not leave home: ${left.message}`)
  }

  world = left.context.world
  log('移動中')

  const arrived = arriveAtSpot({ context: { world, knowledge }, spot })

  if (!arrived.ok) {
    throw new Error(`could not arrive: ${arrived.message}`)
  }

  world = arrived.context.world
  knowledge = arrived.context.knowledge
  const arrivalMinutes = minutesOf(world.time)
  log(`到着（${spot.name}） 知識 ${Math.round(spotKnowledgeScore(knowledge, String(spot.id)))}%`)

  const encounters = spot.fishTable.flatMap((occurrence) => {
    const species = content.speciesById[String(occurrence.speciesId)]

    return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
  })

  let catches = 0
  let xpGained = 0
  const fingerprints: string[] = []

  for (let index = 0; index < options.attempts; index += 1) {
    const beforeMinutes = minutesOf(world.time)
    const attempt = runOneAttempt({ encounters, seed: `${options.seed}#${String(index)}` })
    const landed = attempt.phase === 'LANDED' && attempt.individual !== null
    let attemptXp = 0

    if (landed && attempt.individual !== null) {
      const species = content.speciesById[String(attempt.individual.speciesId)]

      if (species !== undefined) {
        const resolution = resolveCatch({
          individual: attempt.individual,
          species,
          codex,
          progression,
          spotId: String(spot.id),
          capturedAt: '2026-05-02T00:00:00.000Z',
        })
        codex = resolution.codex
        progression = resolution.progression
        attemptXp = resolution.xp.total
        xpGained += attemptXp
        catches += 1
      }

      fingerprints.push(`L:${String(attempt.individual.id)}:${String(attempt.individual.lengthCm)}`)
    } else {
      fingerprints.push(`F:${attempt.phase}`)
    }

    const recorded = recordFishingAttempt({
      context: { world, knowledge },
      spot,
      outcome: landed ? 'landed' : 'failed',
      xpGained: attemptXp,
      ...(landed && attempt.individual !== null
        ? { caughtLengthCm: attempt.individual.lengthCm }
        : {}),
    })

    if (!recorded.ok) {
      throw new Error(`could not record attempt: ${recorded.message}`)
    }

    world = recorded.context.world
    knowledge = recorded.context.knowledge

    const elapsed = minutesOf(world.time) - beforeMinutes

    log(
      `釣り ${String(index + 1)} 回目: ${
        landed
          ? `釣れた（${String(attempt.individual?.lengthCm)}cm, +${String(attemptXp)} XP）`
          : '釣れなかった'
      } / ${formatDuration(elapsed)}経過 / 知識 ${Math.round(
        spotKnowledgeScore(knowledge, String(spot.id)),
      )}%`,
    )
  }

  const departureMinutes = minutesOf(world.time)
  log(`帰路へ（${spot.name} を出発）`)

  const leftSpot = leaveSpot({
    context: { world, knowledge },
    spot,
    transports: content.transports,
    playerTransports,
  })

  if (!leftSpot.ok) {
    throw new Error(`could not leave spot: ${leftSpot.message}`)
  }

  world = leftSpot.context.world
  log('帰宅中')

  const home = arriveHome({ context: { world, knowledge } })

  if (!home.ok) {
    throw new Error(`could not arrive home: ${home.message}`)
  }

  world = home.context.world
  knowledge = home.context.knowledge
  const endedMinutes = minutesOf(world.time)
  log('HOME 到着')

  const notes: string[] = []

  for (const [index, fingerprint] of fingerprints.entries()) {
    notes.push(`${String(index + 1)}:${fingerprint}`)
  }

  return {
    lines,
    fingerprint: `${String(catches)}|${String(xpGained)}|${String(progression.anglerLevel)}|${notes.join(',')}`,
    catches,
    attempts: world.trip?.attempts ?? 0,
    xpGained,
    level: progression.anglerLevel,
    spotKnowledge: spotKnowledgeScore(knowledge, String(spot.id)),
    startedMinutes,
    arrivalMinutes,
    departureMinutes,
    endedMinutes,
  }
}

export const simulateTrip = (options: TripSimulationOptions): TripSimulationResult => {
  const first = runTrip(options)
  const second = runTrip(options)

  const checks = [
    { label: '移動で時間が進む', ok: first.arrivalMinutes > first.startedMinutes },
    { label: '釣り回数分だけ試行した', ok: first.attempts === options.attempts },
    { label: '釣りで時間が進む', ok: first.endedMinutes > first.arrivalMinutes },
    { label: '帰宅で時間が進む', ok: first.endedMinutes > first.departureMinutes },
    { label: 'Knowledge が増えた', ok: first.spotKnowledge > 0 },
    { label: '同じ入力から同じ結果（決定論的）', ok: first.fingerprint === second.fingerprint },
  ]

  const lines = [...first.lines]

  lines.push('')
  lines.push(
    `結果: ${String(first.catches)} / ${String(options.attempts)} 匹, +${String(
      first.xpGained,
    )} XP, Angler Lv ${String(first.level)}, 知識 ${String(Math.round(first.spotKnowledge))}%`,
  )
  lines.push('')
  lines.push('--- checks ---')

  for (const check of checks) {
    lines.push(`  ${check.ok ? 'PASS' : 'FAIL'} ${check.label}`)
  }

  const allOk = checks.every((check) => check.ok)
  lines.push('')
  lines.push(allOk ? 'OK: trip loop is healthy' : 'FAILED: trip loop has problems')

  return { exitCode: allOk ? 0 : 1, lines, checks }
}

const parseArguments = (argv: readonly string[]): TripSimulationOptions => {
  let seed = 'trip'
  let attempts = 3
  let spotId: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (argument === '--seed' && value !== undefined) {
      seed = value
      index += 1
      continue
    }

    if (argument === '--attempts' && value !== undefined) {
      attempts = Number.parseInt(value, 10)
      index += 1
      continue
    }

    if (argument === '--spot' && value !== undefined) {
      spotId = value
      index += 1
    }
  }

  return { seed, attempts, ...(spotId === undefined ? {} : { spotId }) }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateTrip(parseArguments(process.argv.slice(2)))

    for (const line of result.lines) {
      process.stdout.write(`${line}\n`)
    }

    process.exitCode = result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
