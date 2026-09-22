import { describe, expect, it } from 'vitest'
import { balancedCommand, runFightToTerminal } from '../../../tests/fixtures/fishingPolicies'
import { createBigTestSpecies, createTestSpecies } from '../../../tests/fixtures/species'
import { FishingEngine, type FishingSnapshot } from './FishingEngine'
import { DEFAULT_FISHING_TUNING, type FishingTuning } from './FishingTuning'
import { NEUTRAL_FISHING_MODIFIERS, type PlayerFishingModifiers } from './PlayerFishingModifiers'
import { isTerminalPhase, type FishingEvent } from './FishingPhase'

/**
 * Fishing Vertical Slice の中核テスト。
 *
 * UI は使わず、Domain の Engine だけで
 * CAST → WAITING → BITE → HOOK → FIGHT → LAND / FAIL が成立することを確認する。
 * 乱数は必ず固定 seed から作る（決定論的）。
 */

const createEngine = (options: {
  readonly seed: number | string
  readonly presence?: number
  readonly tuning?: Partial<FishingTuning>
  readonly big?: boolean
  readonly modifiers?: Partial<PlayerFishingModifiers>
}): FishingEngine =>
  new FishingEngine({
    encounters: [
      {
        species: options.big === true ? createBigTestSpecies() : createTestSpecies(),
        presence: options.presence ?? 2,
      },
    ],
    seed: options.seed,
    ...(options.modifiers === undefined
      ? {}
      : { playerModifiers: { ...NEUTRAL_FISHING_MODIFIERS, ...options.modifiers } }),
    ...(options.tuning === undefined
      ? {}
      : { tuning: { ...DEFAULT_FISHING_TUNING, ...options.tuning } }),
  })

type AdvanceResult = {
  readonly snapshot: FishingSnapshot
  readonly events: readonly FishingEvent[]
}

const advanceUntil = (
  engine: FishingEngine,
  predicate: (snapshot: FishingSnapshot) => boolean,
  maxTicks = 4000,
): AdvanceResult => {
  const events: FishingEvent[] = []

  for (let index = 0; index < maxTicks; index += 1) {
    const result = engine.tick()
    events.push(...result.events)

    if (predicate(result.snapshot)) {
      return { snapshot: result.snapshot, events }
    }
  }

  throw new Error(`condition was not reached within ${String(maxTicks)} ticks`)
}

type FightOptions = {
  /** 大型魚を使う（小型魚は 1〜3 コマンドで終わるため、駆け引きの検証に使えない）。 */
  readonly big?: boolean
  readonly tuning?: Partial<FishingTuning>
  readonly modifiers?: Partial<PlayerFishingModifiers>
}

/** ヒットさせてファイトまで進める。 */
const createFightingEngine = (seed: number | string, options: FightOptions = {}): FishingEngine => {
  // Phase 10.2 の Bite は飽和カーブで有限値から 100% にならない。
  // この helper は「Bite 率」ではなくファイト挙動だけを検証するため、十分高い presence を使う。
  const engine = createEngine({ seed, presence: 100, ...options })

  engine.cast()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
  engine.hook()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

  return engine
}

/**
 * 「十分な装備と腕がある」状態。
 * ファイトそのもの（コマンドの駆け引き）を見るテストで使い、
 * タックル差そのものは simulate:big-game / catchability が受け持つ。
 */
const SOLID_TACKLE: Partial<PlayerFishingModifiers> = {
  maxTensionMultiplier: 2.4,
  landingStabilityMultiplier: 1.2,
}

describe('FishingEngine', () => {
  it('starts idle and refuses actions that do not belong to the phase', () => {
    const engine = createEngine({ seed: 'start' })

    expect(engine.snapshot().phase).toBe('IDLE')
    expect(engine.snapshot().fish).toBeNull()

    const reel = engine.reel()
    expect(reel.accepted).toBe(false)
    expect(engine.snapshot().phase).toBe('IDLE')
    expect(engine.snapshot().tension).toBe(0)

    const hook = engine.hook()
    expect(hook.accepted).toBe(false)
  })

  it('runs cast → waiting without revealing the fish', () => {
    const engine = createEngine({ seed: 'cast' })

    expect(engine.cast().accepted).toBe(true)
    expect(engine.snapshot().phase).toBe('CASTING')

    for (let index = 0; index < DEFAULT_FISHING_TUNING.castTicks; index += 1) {
      engine.tick()
    }

    const snapshot = engine.snapshot()
    expect(snapshot.phase).toBe('WAITING')
    // ヒットするまでは魚の情報を見せない。
    expect(snapshot.fish).toBeNull()
  })

  it('reveals the fish at the bite and opens the hook window', () => {
    const engine = createEngine({ seed: 'bite' })
    engine.cast()

    const bite = advanceUntil(engine, (snapshot) => snapshot.phase === 'BITE')
    expect(bite.events).toContain('BITE')
    expect(bite.snapshot.fish).not.toBeNull()

    const hookWindow = advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    expect(hookWindow.snapshot.fish?.speciesName).toBe('テスト魚')
    // 個体 id は「魚種#セッション seed#何匹目」で決まる。
    expect(hookWindow.snapshot.fish?.individual.id).toBe('test-species#bite#1')
    expect(hookWindow.snapshot.fish?.individual.traits).toBeInstanceOf(Array)
    expect(hookWindow.snapshot.fish?.individual.weightKg).toBeGreaterThan(0)
  })

  it('cannot hook before the hook window', () => {
    const engine = createEngine({ seed: 'early' })
    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'BITE')

    const outcome = engine.hook()
    expect(outcome.accepted).toBe(false)
    expect(engine.snapshot().phase).toBe('BITE')
  })

  it('hooks and starts the fight', () => {
    const engine = createEngine({ seed: 'fight' })
    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')

    const hooked = engine.hook()
    expect(hooked.accepted).toBe(true)
    expect(hooked.events).toContain('HOOK_SET')
    expect(engine.snapshot().phase).toBe('HOOKED')

    const fighting = advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')
    expect(fighting.snapshot.fish?.stamina).toBe(fighting.snapshot.fish?.staminaMax)
  })

  it('misses the hook when the window expires', () => {
    const engine = createEngine({ seed: 'miss' })
    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')

    const events: FishingEvent[] = []

    for (let index = 0; index < DEFAULT_FISHING_TUNING.hookWindowTicks; index += 1) {
      events.push(...engine.tick().events)
    }

    expect(engine.snapshot().phase).toBe('HOOK_MISSED')
    expect(events).toContain('HOOK_MISSED')
  })

  it('returns to idle with no bite when nothing is present', () => {
    const engine = createEngine({ seed: 'empty', presence: 0 })
    engine.cast()

    const result = advanceUntil(engine, (snapshot) => snapshot.phase === 'IDLE')

    expect(result.events).toContain('NO_BITE')
    expect(result.snapshot.fish).toBeNull()
  })

  it('raises the tension when reeling', () => {
    const engine = createFightingEngine('tension')
    const before = engine.snapshot().tension

    engine.reel()

    expect(engine.snapshot().tension).toBeGreaterThan(before)
  })

  it('lowers the tension when giving line (one battle step)', () => {
    // 大型魚でないと 1 コマンドで寄り切ってしまう（小魚のファイトは短い）。
    const engine = createFightingEngine('give-line', { big: true })

    engine.dispatch('reel')
    const before = engine.snapshot().tension
    engine.dispatch('give')
    const after = engine.snapshot().tension

    expect(after).toBeLessThan(before)
  })

  it('punishes reckless power reeling', () => {
    let sawLineBreak = false
    let maxTensionSeen = 0

    for (const seed of ['spam-1', 'spam-2', 'spam-3', 'spam-4', 'spam-5', 'spam-6']) {
      const engine = createFightingEngine(seed, { big: true })
      let guard = 0

      while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
        const snapshot = engine.snapshot()

        if (snapshot.phase === 'FIGHTING') {
          engine.dispatch('power_reel')
          maxTensionSeen = Math.max(maxTensionSeen, snapshot.tension / snapshot.maxTension)
        } else if (snapshot.phase === 'LANDING') {
          engine.dispatch('land')
        } else {
          engine.tick()
        }

        guard += 1
      }

      if (engine.snapshot().phase === 'LINE_BREAK') {
        sawLineBreak = true
      }
    }

    // 強く巻き続けるのは危険（連打が最適解にならない）。
    expect(sawLineBreak || maxTensionSeen > 0.9).toBe(true)
  })

  it('loses the hook when the player only gives line', () => {
    const engine = createFightingEngine('spam-give')
    let guard = 0

    while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
      const snapshot = engine.snapshot()

      if (snapshot.phase === 'FIGHTING') {
        engine.dispatch('give')
      } else {
        engine.tick()
      }

      guard += 1
    }

    expect(engine.snapshot().phase).toBe('HOOK_ESCAPE')
  })

  it('lands the fish with a sensible balance of reel and give', () => {
    const engine = createFightingEngine('balanced', { big: true, modifiers: SOLID_TACKLE })
    const result = runFightToTerminal(engine)

    expect(result.phase).toBe('LANDED')
    expect(result.events).toContain('FISH_TIRED')
    expect(result.events).toContain('LANDED')
  })

  it('lets the fish run during the fight', () => {
    let sawRun = false

    for (const seed of ['run-1', 'run-2', 'run-3', 'run-4', 'run-5']) {
      const engine = createFightingEngine(seed, { big: true })
      const result = runFightToTerminal(engine)

      if (result.events.includes('RUN_STARTED')) {
        sawRun = true
        break
      }
    }

    expect(sawRun).toBe(true)
  })

  it('reproduces the same individual and the same fight for the same seed', () => {
    const first = createFightingEngine('repeatable', { big: true, modifiers: SOLID_TACKLE })
    const second = createFightingEngine('repeatable', { big: true, modifiers: SOLID_TACKLE })

    expect(first.snapshot().fish).toEqual(second.snapshot().fish)

    const firstRun = runFightToTerminal(first)
    const secondRun = runFightToTerminal(second)

    expect(firstRun.phase).toBe(secondRun.phase)
    expect(firstRun.events).toEqual(secondRun.events)
    expect(first.snapshot().totalTicks).toBe(second.snapshot().totalTicks)
    expect(first.snapshot().fish?.stamina).toBe(second.snapshot().fish?.stamina)
  })

  it('produces different fights for different seeds', () => {
    const lengths = new Set<number>()
    const tickCounts = new Set<number>()

    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const engine = createFightingEngine(seed, { big: true })
      runFightToTerminal(engine)

      const length = engine.snapshot().fish?.individual.lengthCm
      expect(length).toBeDefined()

      if (length !== undefined) {
        lengths.add(length)
      }

      tickCounts.add(engine.snapshot().totalTicks)
    }

    expect(lengths.size).toBeGreaterThan(1)
    expect(tickCounts.size).toBeGreaterThan(1)
  })

  it('reports the events of the last operation only', () => {
    const engine = createEngine({ seed: 'events' })

    const cast = engine.cast()
    expect(cast.events).toEqual(['CAST_STARTED'])

    const tick = engine.tick()
    expect(tick.events).toEqual([])
  })

  it('can be reset after a trip and used again', () => {
    const engine = createFightingEngine('reset')
    const result = runFightToTerminal(engine)

    expect(result.phase).toBe('LANDED')

    const reset = engine.reset()
    expect(reset.accepted).toBe(true)
    expect(reset.events).toContain('SESSION_RESET')
    expect(engine.snapshot().phase).toBe('IDLE')
    expect(engine.snapshot().fish).toBeNull()
    expect(engine.snapshot().tension).toBe(0)

    expect(engine.cast().accepted).toBe(true)
  })

  it('keeps the tension inside the configured range', () => {
    const engine = createFightingEngine('clamp', { big: true, modifiers: SOLID_TACKLE })
    let guard = 0

    while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
      const snapshot = engine.snapshot()
      const commandPhase =
        snapshot.phase === 'FIGHTING' ||
        snapshot.phase === 'LANDING' ||
        snapshot.phase === 'IDLE' ||
        snapshot.phase === 'HOOK_WINDOW'

      if (commandPhase) {
        engine.dispatch(balancedCommand(snapshot))
      } else {
        engine.tick()
      }

      const after = engine.snapshot()
      expect(after.tension).toBeGreaterThanOrEqual(0)
      expect(after.tension).toBeLessThanOrEqual(after.maxTension)
      guard += 1
    }
  })
})
