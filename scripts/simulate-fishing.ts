import { pathToFileURL } from 'node:url'
import { loadContentFromDirectory } from '../src/content/load/nodeContent'
import {
  FishingEngine,
  isTerminalPhase,
  type FishingCommand,
  type FishingSnapshot,
} from '../src/domain/fishing'

/**
 * Fishing Vertical Slice を手元で流して確認するための小さなシミュレータ。
 *
 * ブラウザを開かなくても、Domain のループが成立していることと
 * seed 再現性、魚種ごとの手応えを確認できる。
 *
 * 使い方:
 *   npm run simulate:fishing -- --seed demo
 *   npm run simulate:fishing -- --seed demo --species phase2-sample-fish-e --verbose
 *   npm run simulate:fishing -- --seed demo --policy reel
 */

export type SimulationPolicy = 'balanced' | 'reel' | 'give'

export type SimulationOptions = {
  readonly seed: string
  readonly policy: SimulationPolicy
  readonly maxSteps: number
  readonly verbose: boolean
  readonly speciesId?: string
  /**
   * 釣り場。省略すると国内の基準 Spot（荒川 下流）を使う。
   *
   * Phase 8 で Content が増えたため、`content.primarySpot`（ファイル順の先頭）に
   * 頼ると海外 Spot が基準になってしまう。回帰の基準を固定するために明示する。
   */
  readonly spotId?: string
}

const DEFAULT_SIMULATION_SPOT_ID = 'arakawa-lower'

export type SimulationResult = {
  readonly exitCode: number
  readonly lines: readonly string[]
}

const BALANCED_TENSION_LIMIT = 0.8

export const chooseCommand = (
  policy: SimulationPolicy,
  snapshot: FishingSnapshot,
): FishingCommand => {
  if (snapshot.phase === 'IDLE') {
    return 'cast'
  }

  if (snapshot.phase === 'HOOK_WINDOW') {
    return 'hook'
  }

  if (snapshot.phase === 'FIGHTING') {
    if (policy === 'reel') {
      return 'reel'
    }
    if (policy === 'give') {
      return 'give'
    }

    const ratio = snapshot.tension / snapshot.maxTension
    return snapshot.fish?.behavior === 'run' || ratio > BALANCED_TENSION_LIMIT ? 'give' : 'reel'
  }

  return 'reel'
}

export const simulateFishing = (options: SimulationOptions): SimulationResult => {
  const content = loadContentFromDirectory()
  const spot = content.spots.find(
    (candidate) => String(candidate.id) === (options.spotId ?? DEFAULT_SIMULATION_SPOT_ID),
  )

  if (spot === undefined) {
    throw new Error(`no spot content for: ${String(options.spotId ?? DEFAULT_SIMULATION_SPOT_ID)}`)
  }

  const spotEncounters = spot.fishTable.flatMap((occurrence) => {
    const species = content.speciesById[String(occurrence.speciesId)]

    return species === undefined ? [] : [{ species, presence: occurrence.basePresence }]
  })
  const encounters =
    options.speciesId === undefined
      ? spotEncounters
      : spotEncounters.filter((candidate) => String(candidate.species.id) === options.speciesId)

  if (encounters.length === 0) {
    throw new Error(`no encounter candidate for species: ${String(options.speciesId)}`)
  }

  const engine = new FishingEngine({
    encounters,
    seed: options.seed,
    spotId: spot.id,
  })

  const lines: string[] = [
    `seed=${options.seed} policy=${options.policy} species=${
      options.speciesId ?? `${String(content.species.length)} candidates`
    }`,
  ]

  let steps = 0

  while (!isTerminalPhase(engine.snapshot().phase) && steps < options.maxSteps) {
    const snapshot = engine.snapshot()
    const command = chooseCommand(options.policy, snapshot)
    const outcome = engine.dispatch(command)

    for (const event of outcome.events) {
      lines.push(
        `tick ${String(snapshot.totalTicks).padStart(4)} | ${snapshot.phase} | ${command} | ${event}`,
      )
    }

    const tick = engine.tick()

    for (const event of tick.events) {
      lines.push(
        `tick ${String(tick.snapshot.totalTicks).padStart(4)} | ${tick.snapshot.phase} | tick | ${event}`,
      )
    }

    if (options.verbose) {
      const state = engine.snapshot()
      const fish = state.fish
      lines.push(
        `tick ${String(state.totalTicks).padStart(4)} | ${state.phase.padEnd(11)} | tension ${state.tension
          .toFixed(3)
          .padStart(5)} | stamina ${
          fish === null ? '   -  ' : fish.stamina.toFixed(3).padStart(5)
        } | ${fish === null ? '-' : fish.behavior} | ${command}`,
      )
    }

    if (outcome.accepted) {
      steps += 1
    }
  }

  const final = engine.snapshot()
  const fish = final.fish

  lines.push('')
  lines.push(`phase=${final.phase} ticks=${String(final.totalTicks)} steps=${String(steps)}`)

  if (fish !== null) {
    const individual = fish.individual
    lines.push(
      `fish=${fish.speciesName} length=${String(individual.lengthCm)}cm weight=${individual.weightKg.toFixed(3)}kg condition=${individual.condition.toFixed(2)}(${fish.conditionBand}) percentile=${(individual.percentile ?? 0).toFixed(2)} traits=[${individual.traits.join(',')}] stamina=${fish.stamina.toFixed(3)}/${fish.staminaMax.toFixed(3)} behavior=${fish.behavior}`,
    )
  }

  return {
    exitCode: final.phase === 'LANDED' ? 0 : 1,
    lines,
  }
}

const parseArguments = (argv: readonly string[]): SimulationOptions => {
  let seed = 'demo'
  let policy: SimulationPolicy = 'balanced'
  let maxSteps = 4000
  let verbose = false
  let speciesId: string | undefined
  let spotId: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (argument === '--seed' && value !== undefined) {
      seed = value
      index += 1
      continue
    }

    if (argument === '--species' && value !== undefined) {
      speciesId = value
      index += 1
      continue
    }

    if (argument === '--policy' && value !== undefined) {
      if (value === 'balanced' || value === 'reel' || value === 'give') {
        policy = value
      } else {
        throw new Error(`unknown policy: ${value}`)
      }
      index += 1
      continue
    }

    if (argument === '--max-steps' && value !== undefined) {
      maxSteps = Number.parseInt(value, 10)
      index += 1
      continue
    }

    if (argument === '--spot' && value !== undefined) {
      spotId = value
      index += 1
      continue
    }

    if (argument === '--verbose') {
      verbose = true
    }
  }

  return {
    seed,
    policy,
    maxSteps,
    verbose,
    ...(speciesId === undefined ? {} : { speciesId }),
    ...(spotId === undefined ? {} : { spotId }),
  }
}

const isMainModule = (): boolean => {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href
}

if (isMainModule()) {
  try {
    const result = simulateFishing(parseArguments(process.argv.slice(2)))

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
