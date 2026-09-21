import { pathToFileURL } from 'node:url'
import { loadPhase1SampleContent } from '../src/content/catalog'
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
 * seed 再現性を確認できる。バランス調整の入口でもある。
 *
 * 使い方:
 *   npm run simulate:fishing -- --seed demo
 *   npm run simulate:fishing -- --seed demo --policy reel
 */

export type SimulationPolicy = 'balanced' | 'reel' | 'give'

export type SimulationOptions = {
  readonly seed: string
  readonly policy: SimulationPolicy
  readonly maxSteps: number
  readonly verbose: boolean
}

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
  const content = loadPhase1SampleContent()
  const engine = new FishingEngine({
    encounters: [{ species: content.species, presence: content.presence }],
    seed: options.seed,
  })

  const lines: string[] = [
    `seed=${options.seed} policy=${options.policy} species=${content.species.japaneseName}`,
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
    lines.push(
      `fish=${fish.name} length=${String(fish.lengthCm)}cm stamina=${fish.stamina.toFixed(3)}/${fish.staminaMax.toFixed(3)} behavior=${fish.behavior}`,
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

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    const value = argv[index + 1]

    if (argument === '--seed' && value !== undefined) {
      seed = value
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

    if (argument === '--verbose') {
      verbose = true
    }
  }

  return { seed, policy, maxSteps, verbose }
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
