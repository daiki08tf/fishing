import type { RandomSource } from '../../rng/RandomSource'

/**
 * 魚の行動（Phase 10）。既存の NORMAL / RUN を拡張した generic な状態。
 *
 * 魚種名や ID では分岐しない。FishBattleProfile（既存の fightProfile / Trait /
 * 個体サイズから解決した数値）だけで重みが決まる。
 */

export const BATTLE_BEHAVIOURS = [
  'normal',
  'run',
  'surge',
  'head_shake',
  'dive',
  'come_toward',
  'rest',
  'second_run',
] as const
export type BattleBehaviour = (typeof BATTLE_BEHAVIOURS)[number]

export const BATTLE_BEHAVIOUR_LABELS: Readonly<Record<BattleBehaviour, string>> = {
  normal: '抵抗',
  run: '走り',
  surge: '突進',
  head_shake: '首振り',
  dive: '潜行',
  come_toward: 'こちらへ',
  rest: '休み',
  second_run: '再加速',
}

/** 予兆（telegraph）を出す行動。1 step 前に文章で知らせる。 */
export const TELEGRAPHED_BEHAVIOURS: readonly BattleBehaviour[] = [
  'run',
  'surge',
  'head_shake',
  'dive',
  'come_toward',
  'second_run',
]

export type BehaviourContext = {
  /** 残スタミナ比（0〜1）。 */
  readonly staminaRatio: number
  /** 現在のテンション比（0〜1）。 */
  readonly tensionRatio: number
  readonly distanceM: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/**
 * その瞬間の行動の重み。
 * 疲れるほど走りが減り、休みが増える（HP ゲージではなく「抵抗できる力」として扱う）。
 */
export const behaviourWeights = (input: {
  readonly profile: {
    readonly runTendency: number
    readonly aggression: number
    readonly diveTendency: number
    readonly headShakeTendency: number
  }
  readonly context: BehaviourContext
}): Readonly<Record<BattleBehaviour, number>> => {
  const tired = 1 - clamp(input.context.staminaRatio, 0, 1)
  const runScale = 0.35 + 0.65 * clamp(input.context.staminaRatio, 0, 1)
  const near = 1 - clamp(input.context.distanceM / 45, 0, 1)
  /*
   * 近くまで寄せた魚は長く走れない（走り / 突進 / 潜行は出にくい）。
   * これが無いと「寄せては走られて」を延々と繰り返す膠着が起きる。
   */
  const roomToRun = 0.45 + 0.55 * (1 - near)

  return {
    normal: 0.5,
    run: 0.26 * input.profile.runTendency * runScale * roomToRun,
    surge: 0.16 * input.profile.aggression * runScale * roomToRun,
    head_shake: 0.22 * input.profile.headShakeTendency * (0.5 + 0.5 * near),
    dive: 0.2 * input.profile.diveTendency * runScale * roomToRun,
    come_toward: 0.12 * (0.4 + 0.6 * near),
    rest: 0.06 + 0.7 * tired,
    /*
     * 第二の走りは「残った力」を絞り出す動き — スタミナが本当に尽きた
     * 魚には発動しない（stamina 0 の魚が 4 step × 30m 級の走りを
     * 何度も繰り返すと、Big Game のファイトが際限なく延びる）。
     */
    second_run:
      tired > 0.6 && input.context.staminaRatio > 0.05
        ? 0.22 * input.profile.aggression * roomToRun
        : 0,
  }
}

const pickWeighted = (
  weights: Readonly<Record<BattleBehaviour, number>>,
  random: RandomSource,
): BattleBehaviour => {
  const total = BATTLE_BEHAVIOURS.reduce(
    (sum, behaviour) => sum + Math.max(0, weights[behaviour]),
    0,
  )

  if (total <= 0) {
    return 'normal'
  }

  let threshold = random.next() * total

  for (const behaviour of BATTLE_BEHAVIOURS) {
    threshold -= Math.max(0, weights[behaviour])

    if (threshold <= 0) {
      return behaviour
    }
  }

  return 'normal'
}

/** 行動の継続 step 数（1 step = 1 コマンド）。 */
export const behaviourDuration = (behaviour: BattleBehaviour, random: RandomSource): number => {
  switch (behaviour) {
    case 'surge':
    case 'head_shake':
      return 1
    case 'run':
    case 'second_run':
      return random.int(2, 4)
    case 'dive':
      return random.int(2, 3)
    case 'come_toward':
      return random.int(1, 2)
    case 'rest':
      return random.int(2, 4)
    default:
      return random.int(1, 3)
  }
}

/** 次の行動を選ぶ（決定論的）。 */
export const rollBehaviour = (input: {
  readonly profile: {
    readonly runTendency: number
    readonly aggression: number
    readonly diveTendency: number
    readonly headShakeTendency: number
  }
  readonly context: BehaviourContext
  readonly random: RandomSource
}): { readonly behaviour: BattleBehaviour; readonly steps: number } => {
  const behaviour = pickWeighted(behaviourWeights(input), input.random)

  return { behaviour, steps: behaviourDuration(behaviour, input.random) }
}
