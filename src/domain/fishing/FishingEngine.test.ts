import { describe, expect, it } from 'vitest'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { FishingEngine, type FishingSnapshot } from './FishingEngine'
import { DEFAULT_FISHING_TUNING, type FishingTuning } from './FishingTuning'
import {
  isTerminalPhase,
  type FishingCommand,
  type FishingEvent,
  type FishingPhase,
} from './FishingPhase'

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
}): FishingEngine =>
  new FishingEngine({
    encounters: [{ species: createTestSpecies(), presence: options.presence ?? 2 }],
    seed: options.seed,
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

/** ヒットさせてファイトまで進める。 */
const createFightingEngine = (
  seed: number | string,
  tuning?: Partial<FishingTuning>,
): FishingEngine => {
  const engine = createEngine({ seed, ...(tuning === undefined ? {} : { tuning }) })

  engine.cast()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
  engine.hook()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

  return engine
}

/** テンションと魚の状態を見て、常識的な操作を選ぶ。 */
const balancedCommand = (snapshot: FishingSnapshot): FishingCommand => {
  const ratio = snapshot.tension / snapshot.maxTension

  if (snapshot.fish?.behavior === 'run' || ratio > 0.8) {
    return 'give'
  }

  return 'reel'
}

const runBalancedFight = (
  engine: FishingEngine,
  maxSteps = 2000,
): { readonly phase: FishingPhase; readonly events: readonly FishingEvent[] } => {
  const events: FishingEvent[] = []
  let steps = 0

  while (!isTerminalPhase(engine.snapshot().phase) && steps < maxSteps) {
    const outcome = engine.dispatch(balancedCommand(engine.snapshot()))
    events.push(...outcome.events)
    events.push(...engine.tick().events)
    steps += 1
  }

  return { phase: engine.snapshot().phase, events }
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
    expect(hookWindow.snapshot.fish?.name).toBe('テスト魚')
    expect(hookWindow.snapshot.fish?.individualSeed).toBe('test-species#bite')
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

  it('lowers the tension when giving line', () => {
    const engine = createFightingEngine('give')
    engine.reel()
    engine.reel()
    const peak = engine.snapshot().tension

    engine.give()

    expect(engine.snapshot().tension).toBeLessThan(peak)
  })

  it('breaks the line when the player only reels', () => {
    const engine = createFightingEngine('spam-reel')
    let guard = 0

    while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
      engine.reel()
      engine.tick()
      guard += 1
    }

    expect(engine.snapshot().phase).toBe('LINE_BREAK')
  })

  it('loses the hook when the player only gives line', () => {
    const engine = createFightingEngine('spam-give')
    let guard = 0

    while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
      engine.give()
      engine.tick()
      guard += 1
    }

    expect(engine.snapshot().phase).toBe('HOOK_ESCAPE')
  })

  it('lands the fish with a sensible balance of reel and give', () => {
    const engine = createFightingEngine('balanced')
    const result = runBalancedFight(engine)

    expect(result.phase).toBe('LANDED')
    expect(result.events).toContain('FISH_TIRED')
    expect(result.events).toContain('LANDED')
  })

  it('lets the fish run during the fight', () => {
    let sawRun = false

    for (const seed of ['run-1', 'run-2', 'run-3', 'run-4', 'run-5']) {
      const engine = createFightingEngine(seed)
      const result = runBalancedFight(engine)

      if (result.events.includes('RUN_STARTED')) {
        sawRun = true
        break
      }
    }

    expect(sawRun).toBe(true)
  })

  it('reproduces the same individual and the same fight for the same seed', () => {
    const first = createFightingEngine('repeatable')
    const second = createFightingEngine('repeatable')

    expect(first.snapshot().fish).toEqual(second.snapshot().fish)

    const firstRun = runBalancedFight(first)
    const secondRun = runBalancedFight(second)

    expect(firstRun.phase).toBe(secondRun.phase)
    expect(firstRun.events).toEqual(secondRun.events)
    expect(first.snapshot().totalTicks).toBe(second.snapshot().totalTicks)
    expect(first.snapshot().fish?.stamina).toBe(second.snapshot().fish?.stamina)
  })

  it('produces different fights for different seeds', () => {
    const lengths = new Set<number>()
    const tickCounts = new Set<number>()

    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const engine = createFightingEngine(seed)
      runBalancedFight(engine)

      const length = engine.snapshot().fish?.lengthCm
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
    const result = runBalancedFight(engine)

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
    const engine = createFightingEngine('clamp')
    let guard = 0

    while (!isTerminalPhase(engine.snapshot().phase) && guard < 500) {
      engine.dispatch(balancedCommand(engine.snapshot()))
      engine.tick()

      const snapshot = engine.snapshot()
      expect(snapshot.tension).toBeGreaterThanOrEqual(0)
      expect(snapshot.tension).toBeLessThanOrEqual(snapshot.maxTension)
      guard += 1
    }
  })
})
