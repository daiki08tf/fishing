import { suggestBattleCommand } from '../../src/domain/fishing/battle'
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

export const balancedCommand = (snapshot: FishingSnapshot): FishingCommand => {
  if (snapshot.phase === 'IDLE') {
    return 'cast'
  }

  if (snapshot.phase === 'HOOK_WINDOW') {
    return 'hook'
  }

  if (snapshot.phase === 'FIGHTING' || snapshot.phase === 'LANDING') {
    /*
     * Phase 10: Text Fishing Battle では 1 コマンド = 1 step。
     * テンションと魚の行動を読んで選ぶ（連打では有利にならない）。
     */
    return suggestBattleCommand({
      phase: snapshot.phase,
      tension: snapshot.tension,
      maxTension: snapshot.maxTension,
      behaviour: snapshot.battle?.behaviour ?? null,
      hookHold: snapshot.battle?.hookHold ?? 0,
    })
  }

  return 'reel'
}

export type FightOutcome = {
  readonly phase: FishingPhase
  readonly events: readonly FishingEvent[]
  readonly steps: number
}

/** 条件を満たすまで tick を進める（テスト用）。 */
export const advanceUntil = (
  engine: FishingEngine,
  predicate: (snapshot: FishingSnapshot) => boolean,
  maxTicks = 4000,
): { readonly events: readonly FishingEvent[]; readonly ticks: number } => {
  const events: FishingEvent[] = []

  for (let index = 0; index < maxTicks; index += 1) {
    const result = engine.tick()
    events.push(...result.events)

    if (predicate(result.snapshot)) {
      return { events, ticks: index + 1 }
    }
  }

  throw new Error(`condition was not reached within ${String(maxTicks)} ticks`)
}

/**
 * 釣行が終わるまで進める。
 *
 * Phase 10 以降、FIGHTING / LANDING はコマンド駆動（完全ターン制）である。
 * それ以外の段階は tick で自動的に進む。
 */
export const runFightToTerminal = (engine: FishingEngine, maxSteps = 4000): FightOutcome => {
  const events: FishingEvent[] = []
  let steps = 0

  while (!isTerminalPhase(engine.snapshot().phase) && steps < maxSteps) {
    const snapshot = engine.snapshot()
    const battlePhase = snapshot.phase === 'FIGHTING' || snapshot.phase === 'LANDING'

    if (battlePhase || snapshot.phase === 'IDLE' || snapshot.phase === 'HOOK_WINDOW') {
      const outcome = engine.dispatch(balancedCommand(snapshot))
      events.push(...outcome.events)
    } else {
      events.push(...engine.tick().events)
    }

    steps += 1
  }

  return { phase: engine.snapshot().phase, events, steps }
}
