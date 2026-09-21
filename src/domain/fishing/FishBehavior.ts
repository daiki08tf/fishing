import type { RandomSource } from '../rng/RandomSource'
import type { FishingTuning } from './FishingTuning'

/**
 * 魚自身の行動。
 *
 * 行動の決定は Domain で行う（UI は行動を選べない）。
 * Phase 1 は 2 種類だけだが、将来は魚種固有の行動を追加できる形にする。
 */
export const FISH_BEHAVIORS = ['normal', 'run'] as const
export type FishBehavior = (typeof FISH_BEHAVIORS)[number]

export type BehaviorContext = {
  /** 魚のスピード（0〜1）。速い魚ほど run を起こしやすい。 */
  readonly speed: number
  /** 残スタミナ比（0〜1）。疲れた魚は走りにくい。 */
  readonly staminaRatio: number
  /** Trait（Strong Runner / Aggressive 等）による倍率。 */
  readonly runChanceMultiplier: number
  readonly runDurationMultiplier: number
}

export type BehaviorState = {
  readonly behavior: FishBehavior
  readonly runTicksRemaining: number
}

export type BehaviorDecision = BehaviorState & {
  /** この tick で行動が切り替わったか。 */
  readonly changed: boolean
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * run を起こす確率。
 * 速い魚ほど高く、疲れているほど低くなる。
 */
export const runChance = (context: BehaviorContext, tuning: FishingTuning): number =>
  clamp01(
    tuning.runChancePerTick *
      (0.6 + 0.8 * clamp01(context.speed)) *
      (0.4 + 0.6 * clamp01(context.staminaRatio)) *
      context.runChanceMultiplier,
  )

/**
 * 1 tick 分の行動を決める。
 *
 * - run 中は残り tick を減らし、0 になったら normal へ戻る。
 * - normal 中は確率で run へ移る（run の長さは seed から引く）。
 */
export const decideBehavior = (options: {
  readonly state: BehaviorState
  readonly context: BehaviorContext
  readonly random: RandomSource
  readonly tuning: FishingTuning
}): BehaviorDecision => {
  const { state, context, random, tuning } = options

  if (state.behavior === 'run') {
    const remaining = state.runTicksRemaining - 1

    if (remaining <= 0) {
      return { behavior: 'normal', runTicksRemaining: 0, changed: true }
    }

    return { behavior: 'run', runTicksRemaining: remaining, changed: false }
  }

  if (random.next() < runChance(context, tuning)) {
    const shortest = Math.max(1, Math.round(tuning.minRunTicks * context.runDurationMultiplier))
    const longest = Math.max(
      shortest,
      Math.round(tuning.maxRunTicks * context.runDurationMultiplier),
    )

    return {
      behavior: 'run',
      runTicksRemaining: random.int(shortest, longest),
      changed: true,
    }
  }

  return { behavior: 'normal', runTicksRemaining: 0, changed: false }
}
