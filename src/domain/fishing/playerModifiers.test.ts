import { describe, expect, it } from 'vitest'
import { advanceUntil } from '../../../tests/fixtures/fishingPolicies'
import { createTestSpecies } from '../../../tests/fixtures/species'
import { FishingEngine } from './FishingEngine'
import { DEFAULT_FISHING_TUNING } from './FishingTuning'
import { NEUTRAL_FISHING_MODIFIERS, type PlayerFishingModifiers } from './PlayerFishingModifiers'

/**
 * Skill / Perk から解決された倍率が、Engine にどう効くかの確認。
 * Engine は Skill 名も Level も知らない。
 */

const createEngine = (playerModifiers?: Partial<PlayerFishingModifiers>): FishingEngine =>
  new FishingEngine({
    encounters: [{ species: createTestSpecies(), presence: 2 }],
    seed: 'modifiers',
    playerModifiers: { ...NEUTRAL_FISHING_MODIFIERS, ...playerModifiers },
  })

const driveToFight = (engine: FishingEngine): void => {
  engine.cast()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')
  engine.hook()
  advanceUntil(engine, (snapshot) => snapshot.phase === 'FIGHTING')
}

describe('player fishing modifiers', () => {
  it('behaves exactly as before when neutral', () => {
    const engine = createEngine()

    expect(engine.playerModifiers).toEqual(NEUTRAL_FISHING_MODIFIERS)
    expect(engine.effectiveHookWindowTicks()).toBe(DEFAULT_FISHING_TUNING.hookWindowTicks)
    expect(engine.snapshot().biteForecastTicks).toBeNull()
  })

  it('widens the hook window with a hook window multiplier', () => {
    const engine = createEngine({ hookWindowMultiplier: 2 })

    expect(engine.effectiveHookWindowTicks()).toBe(DEFAULT_FISHING_TUNING.hookWindowTicks * 2)

    engine.cast()
    advanceUntil(engine, (snapshot) => snapshot.phase === 'HOOK_WINDOW')

    // 元の猶予を過ぎても、まだアワセられる。
    for (let index = 0; index < DEFAULT_FISHING_TUNING.hookWindowTicks; index += 1) {
      engine.tick()
    }

    expect(engine.snapshot().phase).toBe('HOOK_WINDOW')
    expect(engine.hook().accepted).toBe(true)
  })

  it('reduces the tension gain with Line Control', () => {
    const neutral = createEngine()
    const skilled = createEngine({ tensionGainMultiplier: 0.6 })

    driveToFight(neutral)
    driveToFight(skilled)
    neutral.reel()
    skilled.reel()

    expect(skilled.snapshot().tension).toBeLessThan(neutral.snapshot().tension)
  })

  it('drains more stamina with a reel efficiency multiplier', () => {
    const neutral = createEngine()
    const skilled = createEngine({ reelEfficiencyMultiplier: 2 })

    driveToFight(neutral)
    driveToFight(skilled)
    neutral.reel()
    skilled.reel()

    const neutralStamina = neutral.snapshot().fish?.stamina ?? 0
    const skilledStamina = skilled.snapshot().fish?.stamina ?? 0

    expect(skilledStamina).toBeLessThan(neutralStamina)
  })

  it('drops the tension faster with a give efficiency multiplier', () => {
    const neutral = createEngine()
    const skilled = createEngine({ giveEfficiencyMultiplier: 2 })

    driveToFight(neutral)
    driveToFight(skilled)
    for (let index = 0; index < 6; index += 1) {
      neutral.reel()
      skilled.reel()
    }

    neutral.give()
    skilled.give()

    expect(skilled.snapshot().tension).toBeLessThan(neutral.snapshot().tension)
  })

  it('reveals the upcoming bite only with high Detection', () => {
    const neutral = createEngine()
    const sharp = createEngine({ detectionClarityMultiplier: 1.5 })

    neutral.cast()
    sharp.cast()
    advanceUntil(neutral, (snapshot) => snapshot.phase === 'WAITING')
    advanceUntil(sharp, (snapshot) => snapshot.phase === 'WAITING')

    expect(neutral.snapshot().biteForecastTicks).toBeNull()
    expect(sharp.snapshot().biteForecastTicks).not.toBeNull()
    expect(sharp.snapshot().biteForecastTicks).toBeGreaterThanOrEqual(0)
  })

  it('keeps the hook window at least one tick', () => {
    const engine = createEngine({ hookWindowMultiplier: 0.01 })

    expect(engine.effectiveHookWindowTicks()).toBeGreaterThanOrEqual(1)
  })

  it('exposes the modifiers in the snapshot for the UI', () => {
    const engine = createEngine({ detectionClarityMultiplier: 1.4 })

    expect(engine.snapshot().playerModifiers.detectionClarityMultiplier).toBe(1.4)
  })
})
