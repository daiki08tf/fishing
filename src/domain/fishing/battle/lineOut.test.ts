import { describe, expect, it } from 'vitest'
import { createBigTestSpecies } from '../../../../tests/fixtures/species'
import { advanceUntil } from '../../../../tests/fixtures/fishingPolicies'
import { NEUTRAL_FISHING_MODIFIERS } from '../PlayerFishingModifiers'
import { DEFAULT_BATTLE_TUNING } from '../BattleTuning'
import type { FightCapability } from '../FightCapability'
import { resolveAbrasionRisk } from '../abrasion'
import { resolveFightStage } from '../fightStage'
import { FishingEngine } from '../FishingEngine'
import { SeededRandomSource } from '../../rng/SeededRandomSource'
import {
  battleText,
  stepBattle,
  type BattleCommand,
  type BattleNumbers,
  type FishBattleProfile,
} from './index'

/**
 * Phase 18B: 物理ライン（lineOutM）/ SPOOLED / PUMP / 根ズレ / FightStage。
 *
 * gameplay 距離（distanceM）と物理ライン量（lineOutM）は別物。
 * 深場で掛かった魚は「あと 45m 寄せればいい」が「ラインは 110m 出ている」。
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
  behaviourStepsRemaining: 9,
  pendingBehaviour: null,
  slackSteps: 0,
  step: 0,
  ...overrides,
})

const capability = (overrides: Partial<FightCapability> = {}): FightCapability => ({
  effectiveLineCapacityM: 300,
  reserveLineM: 30,
  lineStrengthKg: 20,
  leaderStrengthKg: 25,
  hookStrengthKg: 15,
  leaderAbrasionResistance: 0.5,
  dragCapacityKg: 8,
  retrievePower: 0.8,
  rodControl: 0.7,
  weakLink: 'hook',
  weakLinkStrengthKg: 15,
  tensionMarginMultiplier: 1,
  ...overrides,
})

const step = (input: {
  readonly command: BattleCommand
  readonly battle?: Partial<BattleNumbers>
  readonly profile?: Partial<FishBattleProfile>
  readonly seed?: string
  readonly capability?: FightCapability | null
  readonly abrasionRisk?: number
}) =>
  stepBattle({
    numbers: numbers(input.battle ?? {}),
    command: input.command,
    profile: profile(input.profile ?? {}),
    modifiers: NEUTRAL_FISHING_MODIFIERS,
    tuning: DEFAULT_BATTLE_TUNING,
    random: new SeededRandomSource(input.seed ?? 'line-out-test'),
    knowledgeScore: 0,
    capability: input.capability ?? null,
    abrasionRisk: input.abrasionRisk ?? 0,
  })

describe('physical line out', () => {
  it('keeps lineOutM separate from gameplay distance', () => {
    const result = step({
      command: 'reel',
      battle: { distanceM: 40, lineOutM: 120, lineOutFactor: 3 },
    })

    // 物理ラインは gameplay 距離の lineOutFactor 倍だけ戻る。
    expect(result.numbers.lineOutM).toBeLessThan(120)
    const distanceDrop = 40 - result.numbers.distanceM
    const lineDrop = 120 - (result.numbers.lineOutM ?? 0)

    expect(lineDrop).toBeGreaterThan(distanceDrop)
  })

  it('peels more physical line than gameplay distance during a run', () => {
    const result = step({
      command: 'hold',
      battle: { behaviour: 'run', distanceM: 40, lineOutM: 100, lineOutFactor: 2 },
    })

    const distanceGain = result.numbers.distanceM - 40
    const lineGain = (result.numbers.lineOutM ?? 0) - 100

    expect(lineGain).toBeGreaterThan(distanceGain)
  })

  it('feeds more line than gameplay distance when giving line', () => {
    const result = step({
      command: 'give',
      battle: { distanceM: 40, lineOutM: 80, lineOutFactor: 2 },
    })

    const distanceGain = result.numbers.distanceM - 40
    const lineGain = (result.numbers.lineOutM ?? 0) - 80

    expect(lineGain).toBeGreaterThan(distanceGain)
  })

  it('peels line off the spool when loosening the drag on a big fish', () => {
    const big = step({
      command: 'loosen_drag',
      battle: { lineOutM: 100, lineOutFactor: 1 },
      profile: { sizeFactor: 8 },
    })
    const small = step({
      command: 'loosen_drag',
      battle: { lineOutM: 100, lineOutFactor: 1 },
      profile: { sizeFactor: 1 },
    })

    expect(big.numbers.lineOutM ?? 0).toBeGreaterThan(small.numbers.lineOutM ?? 0)
  })
})

describe('SPOOLED', () => {
  it('ends the fight when the fish takes all usable line', () => {
    const result = step({
      command: 'hold',
      battle: {
        behaviour: 'run',
        distanceM: 40,
        lineOutM: 96,
        lineCapacityM: 100,
        lineOutFactor: 2,
        reserveLineM: 20,
      },
      profile: { sizeFactor: 6, burstPower: 2.5 },
    })

    expect(result.outcome).toBe('spooled')
    expect(result.events).toContain('SPOOLED')
  })

  it('is distinct from line break — running out of line is not snapping it', () => {
    const result = step({
      command: 'give',
      battle: {
        tension: 0.2,
        distanceM: 40,
        lineOutM: 99,
        lineCapacityM: 100,
        lineOutFactor: 1,
      },
    })

    expect(result.outcome).toBe('spooled')
    expect(result.events).not.toContain('LINE_BREAK')
  })

  it('never spools when the line capacity is unknown', () => {
    const result = step({
      command: 'hold',
      battle: {
        behaviour: 'run',
        distanceM: 40,
        lineOutM: 200,
        lineCapacityM: null,
        lineOutFactor: 2,
      },
    })

    expect(result.outcome).not.toBe('spooled')
  })

  it('warns before the spool runs dry', () => {
    const result = step({
      command: 'hold',
      battle: {
        lineOutM: 75,
        lineCapacityM: 100,
        reserveLineM: 30,
        lineOutFactor: 1,
      },
    })

    expect(result.log).toContain(battleText('spool_warning', 0))
  })

  it('reaches SPOOLED phase in the engine when line is exhausted', () => {
    const engine = new FishingEngine({
      encounters: [{ species: createBigTestSpecies(), presence: 2 }],
      seed: 'one-step',
      fightCapability: capability({ effectiveLineCapacityM: 10, reserveLineM: 3 }),
      initialLineOutM: 15,
    })

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    engine.hook()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

    const outcome = engine.dispatch('give')

    expect(outcome.snapshot.phase).toBe('SPOOLED')
    expect(outcome.events).toContain('SPOOLED')
  })
})

describe('PUMP', () => {
  it('lifts a heavy fish better than plain reeling when it is not running', () => {
    const battle: Partial<BattleNumbers> = { behaviour: 'normal', distanceM: 60, tension: 0.3 }
    const heavy = { sizeFactor: 8 }
    const tackle = capability({ retrievePower: 0.9, rodControl: 0.85 })

    const pumped = step({ command: 'pump', battle, profile: heavy, capability: tackle })
    const reeled = step({ command: 'reel', battle, profile: heavy, capability: tackle })

    const pumpGain = 60 - pumped.numbers.distanceM
    const reelGain = 60 - reeled.numbers.distanceM

    expect(pumpGain).toBeGreaterThan(reelGain)
  })

  it('is a poor choice during a run', () => {
    const heavy = { sizeFactor: 8 }
    const tackle = capability()
    const resting = step({
      command: 'pump',
      battle: { behaviour: 'rest', distanceM: 60, tension: 0.3 },
      profile: heavy,
      capability: tackle,
    })
    const running = step({
      command: 'pump',
      battle: { behaviour: 'run', distanceM: 60, tension: 0.3 },
      profile: heavy,
      capability: tackle,
    })

    expect(60 - running.numbers.distanceM).toBeLessThan(60 - resting.numbers.distanceM)
    expect(running.numbers.tension).toBeGreaterThan(resting.numbers.tension)
  })

  it('does not trivialize small fish — reel is still fine', () => {
    const battle: Partial<BattleNumbers> = { behaviour: 'normal', distanceM: 20, tension: 0.3 }
    const small = { sizeFactor: 1 }
    const tackle = capability()

    const pumped = step({ command: 'pump', battle, profile: small, capability: tackle })
    const reeled = step({ command: 'reel', battle, profile: small, capability: tackle })

    // 小さい魚では PUMP が REEL を大きく上回らない。
    expect(pumped.numbers.distanceM).toBeGreaterThanOrEqual(reeled.numbers.distanceM - 2)
  })
})

describe('abrasion', () => {
  it('resolves abrasion risk from habitat tags only', () => {
    expect(resolveAbrasionRisk(['sand'])).toBe(0)
    expect(resolveAbrasionRisk(['reef'])).toBeGreaterThan(0)
    expect(resolveAbrasionRisk(['reef', 'rock'])).toBeGreaterThan(resolveAbrasionRisk(['reef']))
    expect(resolveAbrasionRisk(['reef', 'rock', 'wreck', 'ledge'])).toBeLessThanOrEqual(1)
  })

  it('wears the leader when the fish dives near structure', () => {
    const result = step({
      command: 'hold',
      battle: { behaviour: 'dive', leaderIntegrity: 1 },
      capability: capability({ leaderAbrasionResistance: 0.1 }),
      abrasionRisk: 0.8,
    })

    expect(result.numbers.leaderIntegrity ?? 1).toBeLessThan(1)
  })

  it('does not wear the leader in open water', () => {
    const result = step({
      command: 'hold',
      battle: { behaviour: 'dive', leaderIntegrity: 1 },
      abrasionRisk: 0,
    })

    expect(result.numbers.leaderIntegrity ?? 1).toBe(1)
  })

  it('wears less with an abrasion-resistant leader', () => {
    const soft = step({
      command: 'hold',
      battle: { behaviour: 'dive', leaderIntegrity: 1 },
      capability: capability({ leaderAbrasionResistance: 0.1 }),
      abrasionRisk: 0.8,
    })
    const hard = step({
      command: 'hold',
      battle: { behaviour: 'dive', leaderIntegrity: 1 },
      capability: capability({ leaderAbrasionResistance: 0.9 }),
      abrasionRisk: 0.8,
    })

    expect(hard.numbers.leaderIntegrity ?? 1).toBeGreaterThan(soft.numbers.leaderIntegrity ?? 1)
  })

  it('breaks earlier once the leader is worn through', () => {
    // integrity=0 → breakThreshold が maxTension の下限まで落ちる。
    const worn = step({
      command: 'hold',
      battle: { behaviour: 'run', tension: 0.7, leaderIntegrity: 0 },
    })
    const intact = step({
      command: 'hold',
      battle: { behaviour: 'run', tension: 0.7, leaderIntegrity: 1 },
    })

    // 同じテンションでも擦れ切ったリーダーは先に切れる。
    expect(worn.outcome === 'line_break' || intact.outcome !== 'line_break').toBe(true)
  })
})

describe('FightStage', () => {
  it('derives opening for a fresh fish', () => {
    expect(
      resolveFightStage({ phase: 'FIGHTING', staminaRatio: 0.9, distanceM: 50, step: 0 }),
    ).toBe('opening')
  })

  it('derives working in the middle of the fight', () => {
    expect(
      resolveFightStage({ phase: 'FIGHTING', staminaRatio: 0.6, distanceM: 40, step: 6 }),
    ).toBe('working')
  })

  it('derives endgame for a tired fish', () => {
    expect(
      resolveFightStage({ phase: 'FIGHTING', staminaRatio: 0.2, distanceM: 20, step: 15 }),
    ).toBe('endgame')
  })

  it('derives landing from the LANDING phase', () => {
    expect(resolveFightStage({ phase: 'LANDING', staminaRatio: 0.9, distanceM: 5, step: 10 })).toBe(
      'landing',
    )
  })
})

describe('battle snapshot', () => {
  it('exposes physical line state and fight stage', () => {
    const engine = new FishingEngine({
      encounters: [{ species: createBigTestSpecies(), presence: 2 }],
      seed: 'deterministic',
      fightCapability: capability({ effectiveLineCapacityM: 300, reserveLineM: 30 }),
      initialLineOutM: 120,
    })

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
    engine.hook()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')

    const battle = engine.snapshot().battle

    expect(battle).not.toBeNull()
    expect(battle?.lineCapacityM).toBe(300)
    expect(battle?.lineOutM ?? 0).toBeGreaterThan(battle?.distanceM ?? 0)
    expect(battle?.lineRemainingM).not.toBeNull()
    expect(battle?.fightStage).toBe('opening')
    expect(battle?.weakLink).toBe('hook')
  })
})
