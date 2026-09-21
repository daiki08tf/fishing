import {
  isTerminalPhase,
  type FishingCommand,
  type FishingEngine,
  type FishingEvent,
  type FishingPhase,
  type FishingSnapshot,
} from '../../src/domain/fishing'

/**
 * テスト用の操作方針。
 *
 * 「常識的な釣り人」の操作を再現する。連打では勝てないため、
 * テンションを見て REEL と GIVE を切り替える。
 */

const BALANCED_TENSION_LIMIT = 0.8

export const balancedCommand = (snapshot: FishingSnapshot): FishingCommand => {
  if (snapshot.phase === 'IDLE') {
    return 'cast'
  }

  if (snapshot.phase === 'HOOK_WINDOW') {
    return 'hook'
  }

  if (snapshot.phase === 'FIGHTING') {
    const ratio = snapshot.tension / snapshot.maxTension
    return snapshot.fish?.behavior === 'run' || ratio > BALANCED_TENSION_LIMIT ? 'give' : 'reel'
  }

  return 'reel'
}

export type FightOutcome = {
  readonly phase: FishingPhase
  readonly events: readonly FishingEvent[]
  readonly steps: number
}

/** 釣行が終わるまで操作と tick を繰り返す。 */
export const runFightToTerminal = (engine: FishingEngine, maxSteps = 4000): FightOutcome => {
  const events: FishingEvent[] = []
  let steps = 0

  while (!isTerminalPhase(engine.snapshot().phase) && steps < maxSteps) {
    const outcome = engine.dispatch(balancedCommand(engine.snapshot()))
    events.push(...outcome.events)
    events.push(...engine.tick().events)
    steps += 1
  }

  return { phase: engine.snapshot().phase, events, steps }
}
