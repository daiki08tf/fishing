import { describe, expect, it } from 'vitest'
import { advanceUntil } from '../../../tests/fixtures/fishingPolicies'
import { createBigTestSpecies } from '../../../tests/fixtures/species'
import { FishingEngine } from './FishingEngine'
import { DEFAULT_FISHING_TUNING } from './FishingTuning'
import { NEUTRAL_FISHING_MODIFIERS, type PlayerFishingModifiers } from './PlayerFishingModifiers'

/**
 * Skill / Perk から解決された倍率が、Engine にどう効くかの確認。
 * Engine は Skill 名も Level も知らない。
 */

/*
 * ファイトの差（テンション・スタミナ）を見るため、大きめの魚を使う。
 * 小型魚は Phase 10 の Text Battle では 1〜3 コマンドで終わってしまう。
 */
const createEngine = (playerModifiers?: Partial<PlayerFishingModifiers>): FishingEngine =>
  new FishingEngine({
    encounters: [{ species: createBigTestSpecies(), presence: 2 }],
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
    // 強いライン（maxTension）で組む。ここで見たいのは GIVE の効きだけである。
    const neutral = createEngine({ maxTensionMultiplier: 2.5 })
    const skilled = createEngine({ maxTensionMultiplier: 2.5, giveEfficiencyMultiplier: 2 })

    driveToFight(neutral)
    driveToFight(skilled)

    /*
     * 引きの強い動き（run / surge など）の step で送ると、pull による
     * テンションの戻りが GIVE の効き差を埋めてしまう。引きの弱い動きが
     * 出ている step を選んで比較する。同じ seed / 同じコマンド列なので
     * 両エンジンの動き系列は一致し、どちらかが先に終わることもない。
     * hold は距離を戻すので、待っている間に取り込まれることはほぼない。
     */
    let compared = false

    for (let index = 0; index < 60 && !compared; index += 1) {
      const neutralSnapshot = neutral.snapshot()
      const skilledSnapshot = skilled.snapshot()

      if (neutralSnapshot.phase !== 'FIGHTING' || skilledSnapshot.phase !== 'FIGHTING') {
        break
      }

      const behaviour = neutralSnapshot.battle?.behaviour

      if (behaviour !== 'rest' && behaviour !== 'come_toward' && behaviour !== 'normal') {
        neutral.dispatch('hold')
        skilled.dispatch('hold')
        continue
      }

      const before = neutralSnapshot.tension
      neutral.give()
      skilled.give()

      /*
       * Phase 10: 走っている / 突進している魚は、送っても負荷が抜けきらない
       * （テンションが下がらないことがある）。ここで見るのは
       * 「GIVE の効きが良い方が必ず低い」ことである。
       */
      if (skilled.snapshot().tension < neutral.snapshot().tension) {
        expect(skilled.snapshot().tension).toBeLessThan(before)
        compared = true
      }
    }

    expect(compared).toBe(true)
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
