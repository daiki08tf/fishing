import { describe, expect, it } from 'vitest'
import { createBigTestSpecies, createTestSpecies } from '../../../../tests/fixtures/species'
import { advanceUntil } from '../../../../tests/fixtures/fishingPolicies'
import { NEUTRAL_FISHING_MODIFIERS } from '../PlayerFishingModifiers'
import { DEFAULT_BATTLE_TUNING } from '../BattleTuning'
import { FishingEngine } from '../FishingEngine'
import { isTerminalPhase } from '../FishingPhase'
import { SeededRandomSource } from '../../rng/SeededRandomSource'
import {
  attemptLanding,
  battleText,
  behaviourHint,
  stepBattle,
  type BattleCommand,
  type BattleNumbers,
  type FishBattleProfile,
} from './index'

/**
 * Phase 10: Text Fishing Battle。
 *
 * ここで固定したいのは「1 コマンド = 1 step の判断ゲーム」であること。
 * 数値のバランス（着地率など）は simulate:text-battle / simulate:big-game が見る。
 */

const profile = (overrides: Partial<FishBattleProfile> = {}): FishBattleProfile => ({
  sizeFactor: 3,
  runTendency: 0.7,
  aggression: 0.7,
  diveTendency: 0.5,
  headShakeTendency: 0.6,
  burstPower: 2,
  endurance: 1,
  hookHoldCapacity: 1,
  ...overrides,
})

const numbers = (overrides: Partial<BattleNumbers> = {}): BattleNumbers => ({
  tension: 0.5,
  maxTension: 1,
  stamina: 0.8,
  staminaMax: 1,
  distanceM: 30,
  hookHold: 1,
  drag: 0.5,
  behaviour: 'normal',
  // 大きい値にしておくと行動が振り直されない（行動ごとの差だけを見られる）。
  behaviourStepsRemaining: 9,
  pendingBehaviour: null,
  slackSteps: 0,
  step: 0,
  ...overrides,
})

const step = (input: {
  readonly command: BattleCommand
  readonly battle?: Partial<BattleNumbers>
  readonly profile?: Partial<FishBattleProfile>
  readonly seed?: string
}) =>
  stepBattle({
    numbers: numbers(input.battle ?? {}),
    command: input.command,
    profile: profile(input.profile ?? {}),
    modifiers: NEUTRAL_FISHING_MODIFIERS,
    tuning: DEFAULT_BATTLE_TUNING,
    random: new SeededRandomSource(input.seed ?? 'battle-test'),
    knowledgeScore: 0,
  })

const landingChance = (input: {
  readonly battle?: Partial<BattleNumbers>
  readonly struggles?: boolean
  readonly attempts?: number
}): number => {
  const attempts = input.attempts ?? 200
  let landed = 0

  for (let index = 0; index < attempts; index += 1) {
    const result = attemptLanding({
      numbers: numbers({
        ...(input.struggles === true ? { behaviour: 'surge' } : {}),
        ...(input.battle ?? {}),
      }),
      command: 'land',
      profile: profile(),
      modifiers: NEUTRAL_FISHING_MODIFIERS,
      tuning: DEFAULT_BATTLE_TUNING,
      random: new SeededRandomSource(`landing#${String(index)}`),
    })

    if (result.outcome === 'landing') {
      landed += 1
    }
  }

  return landed / attempts
}

describe('text battle commands', () => {
  it('one command is one battle step', () => {
    const engine = new FishingEngine({
      encounters: [{ species: createBigTestSpecies(), presence: 2 }],
      seed: 'one-step',
    })

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    engine.hook()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

    const before = engine.snapshot().battle
    engine.dispatch('reel')
    const after = engine.snapshot().battle

    expect(before?.step).toBe(0)
    expect(after?.step).toBe(1)
  })

  it('does not advance the fight with ticks alone', () => {
    const engine = new FishingEngine({
      encounters: [{ species: createBigTestSpecies(), presence: 2 }],
      seed: 'tick-noop',
    })

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    engine.hook()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

    const before = engine.snapshot()

    for (let index = 0; index < 50; index += 1) {
      engine.tick()
    }

    const after = engine.snapshot()
    expect(after.phase).toBe('FIGHTING')
    expect(after.battle?.step).toBe(before.battle?.step)
    expect(after.battle?.distanceM).toBe(before.battle?.distanceM)
    expect(after.tension).toBe(before.tension)
  })

  it('sends the line out when giving at slack tension', () => {
    const result = step({ command: 'give', battle: { tension: 0.05, slackSteps: 2 } })

    expect(result.numbers.slackSteps).toBe(3)
    expect(result.outcome).toBe('hook_escape')
    expect(result.events).toContain('HOOK_ESCAPE')
  })

  it('reduces the tension when giving line while the fish is not running', () => {
    const before = 0.6
    const result = step({ command: 'give', battle: { tension: before, behaviour: 'normal' } })

    expect(result.numbers.tension).toBeLessThan(before - 0.05)
  })
})

describe('fish behaviour changes what a command means', () => {
  it('makes power reeling during a run dangerous', () => {
    const reel = step({ command: 'reel', battle: { behaviour: 'run', tension: 0.3 } })
    const power = step({ command: 'power_reel', battle: { behaviour: 'run', tension: 0.3 } })
    const held = step({ command: 'hold', battle: { behaviour: 'run', tension: 0.3 } })

    expect(power.numbers.tension).toBeGreaterThan(reel.numbers.tension)
    expect(power.numbers.tension).toBeGreaterThan(held.numbers.tension)
  })

  it('breaks the line when power reeling a running fish at high tension', () => {
    const result = step({
      command: 'power_reel',
      battle: { behaviour: 'surge', tension: 0.95 },
      profile: { burstPower: 2.5 },
    })

    expect(result.outcome).toBe('line_break')
    expect(result.events).toContain('LINE_BREAK')
  })

  it('recovers the line quickly when the fish comes toward the player', () => {
    const toward = step({ command: 'reel', battle: { behaviour: 'come_toward' } })
    const running = step({ command: 'reel', battle: { behaviour: 'run' } })

    expect(toward.numbers.distanceM).toBeLessThan(running.numbers.distanceM)
  })

  it('warns about slack when giving line to a fish that is coming toward the player', () => {
    const result = step({ command: 'give', battle: { behaviour: 'come_toward' } })

    expect(result.log).toContain(battleText('give_slack_risk', 0))
  })

  it('damages the hook hold with head shakes more than with a normal pull', () => {
    const shake = step({ command: 'hold', battle: { behaviour: 'head_shake' } })
    const normal = step({ command: 'hold', battle: { behaviour: 'normal' } })

    expect(shake.numbers.hookHold).toBeLessThan(normal.numbers.hookHold)
  })

  it('makes rest a chance to reel the fish in', () => {
    const rest = step({ command: 'reel', battle: { behaviour: 'rest' } })
    const normal = step({ command: 'reel', battle: { behaviour: 'normal' } })

    expect(rest.numbers.distanceM).toBeLessThan(normal.numbers.distanceM)
    expect(rest.log).toContain(battleText('reel_effective', 0))
  })
})

describe('drag', () => {
  it('changes how the next step behaves', () => {
    const loose = step({ command: 'reel', battle: { drag: 0.1 } })
    const tight = step({ command: 'reel', battle: { drag: 0.95 } })

    // 締めた方がテンションが上がりやすい（そのぶん止められる）。
    expect(tight.numbers.tension).toBeGreaterThan(loose.numbers.tension)
  })

  it('moves the drag setting with the drag commands', () => {
    const loosened = step({ command: 'loosen_drag' })
    const tightened = step({ command: 'tighten_drag' })

    expect(loosened.numbers.drag).toBeLessThan(0.5)
    expect(tightened.numbers.drag).toBeGreaterThan(0.5)
  })
})

describe('landing', () => {
  it('is harder while the fish is still struggling', () => {
    const calm = landingChance({ struggles: false })
    const struggling = landingChance({ struggles: true })

    expect(struggling).toBeLessThan(calm)
  })

  it('is easier once the fish is tired', () => {
    const fresh = landingChance({ battle: { stamina: 0.9 } })
    const tired = landingChance({ battle: { stamina: 0.1 } })

    expect(tired).toBeGreaterThan(fresh)
  })

  it('costs hook hold when the attempt fails', () => {
    let failure: ReturnType<typeof attemptLanding> | null = null

    for (let index = 0; index < 50 && failure === null; index += 1) {
      const result = attemptLanding({
        numbers: numbers({ behaviour: 'surge', hookHold: 1 }),
        command: 'land',
        profile: profile(),
        modifiers: NEUTRAL_FISHING_MODIFIERS,
        tuning: DEFAULT_BATTLE_TUNING,
        random: new SeededRandomSource(`landing-failure#${String(index)}`),
      })

      if (result.outcome === 'continue') {
        failure = result
      }
    }

    expect(failure).not.toBeNull()
    expect(failure?.numbers.hookHold).toBeLessThan(1)
    expect(failure?.numbers.distanceM).toBeGreaterThan(30)
  })
})

describe('telegraph and knowledge', () => {
  it('describes the next behaviour more precisely with knowledge', () => {
    const low = behaviourHint('head_shake', 0, 0)
    const mid = behaviourHint('head_shake', 40, 0)
    const high = behaviourHint('head_shake', 80, 0)

    expect(low).not.toBe(mid)
    expect(mid).not.toBe(high)
    expect(high).toContain('首')
  })

  it('keeps the fight itself the same regardless of knowledge', () => {
    const run = (knowledgeScore: number) => {
      const engine = new FishingEngine({
        encounters: [{ species: createBigTestSpecies(), presence: 2 }],
        seed: 'knowledge',
        knowledgeScore,
      })

      engine.cast()
      advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
      engine.hook()
      advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

      let guard = 0

      while (!isTerminalPhase(engine.snapshot().phase) && guard < 4000) {
        const snapshot = engine.snapshot()

        if (snapshot.phase === 'FIGHTING') {
          engine.dispatch(snapshot.battle !== null && snapshot.battle.drag > 0.5 ? 'give' : 'reel')
        } else if (snapshot.phase === 'LANDING') {
          engine.dispatch('land')
        } else {
          engine.tick()
        }

        guard += 1
      }

      return engine.snapshot()
    }

    const blind = run(0)
    const expert = run(90)

    expect(blind.phase).toBe(expert.phase)
    expect(blind.tension).toBe(expert.tension)
    expect(blind.battle?.distanceM).toBe(expert.battle?.distanceM)
  })
})

describe('determinism', () => {
  it('reproduces the same fight for the same seed and the same commands', () => {
    const commands: readonly BattleCommand[] = [
      'reel',
      'hold',
      'give',
      'reel',
      'reel',
      'tighten_drag',
      'hold',
      'reel',
      'power_reel',
      'reel',
    ]

    const run = () => {
      const engine = new FishingEngine({
        encounters: [{ species: createBigTestSpecies(), presence: 2 }],
        seed: 'deterministic',
      })

      engine.cast()
      advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
      engine.hook()
      advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

      for (const command of commands) {
        if (engine.snapshot().phase !== 'FIGHTING') {
          break
        }

        engine.dispatch(command)
      }

      return engine.snapshot()
    }

    const first = run()
    const second = run()

    expect(first.battle).toEqual(second.battle)
    expect(first.phase).toBe(second.phase)
  })

  it('keeps small fish fights short', () => {
    const engine = new FishingEngine({
      encounters: [{ species: createTestSpecies(), presence: 2 }],
      seed: 'short',
    })

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    engine.hook()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

    let commands = 0

    while (!isTerminalPhase(engine.snapshot().phase) && commands < 20) {
      const snapshot = engine.snapshot()

      if (snapshot.phase === 'FIGHTING') {
        engine.dispatch('reel')
        commands += 1
      } else if (snapshot.phase === 'LANDING') {
        engine.dispatch('land')
        commands += 1
      } else {
        engine.tick()
      }
    }

    expect(engine.snapshot().phase).toBe('LANDED')
    expect(commands).toBeLessThanOrEqual(3)
  })
})
