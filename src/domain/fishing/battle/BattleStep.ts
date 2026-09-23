import type { RandomSource } from '../../rng/RandomSource'
import type { FishingEvent } from '../FishingPhase'
import type { PlayerFishingModifiers } from '../PlayerFishingModifiers'
import type { BattleTuning } from '../BattleTuning'
import { rollBehaviour, type BattleBehaviour, type BehaviourContext } from './BattleBehaviour'
import { battleText, behaviourHint } from './BattleText'

/**
 * Text Fishing Battle の 1 step（Phase 10）。
 *
 * プレイヤーの 1 コマンド = 1 step。同じコマンドでも
 * 「魚の行動 × 今の状態 × タックル」で結果が変わる（固定ダメージボタンにしない）。
 * ここは pure function。乱数は注入され、同じ入力なら同じ結果になる。
 */

/** 魚の「戦い方」。Content の fightProfile / Trait / 個体サイズから解決済みの数値。 */
export type FishBattleProfile = {
  /** 個体の大きさ（0.3〜5.0 目安）。距離と引きの重さに効く。 */
  readonly sizeFactor: number
  readonly runTendency: number
  readonly aggression: number
  readonly diveTendency: number
  readonly headShakeTendency: number
  /** 引きの強さ（1 が標準。Phase 9 の pullMultiplier 由来）。 */
  readonly burstPower: number
  /** 粘り（1 が標準。大きいほど疲れにくい）。 */
  readonly endurance: number
  /** フック保持の上限（Phase 9.1 の hookRetentionMultiplier 由来。1 が標準）。 */
  readonly hookHoldCapacity: number
}

export type BattleNumbers = {
  readonly tension: number
  readonly maxTension: number
  readonly stamina: number
  readonly staminaMax: number
  readonly distanceM: number
  readonly hookHold: number
  readonly drag: number
  readonly behaviour: BattleBehaviour
  readonly behaviourStepsRemaining: number
  /** 次の step で発動する行動（予兆を出したもの）。 */
  readonly pendingBehaviour: BattleBehaviour | null
  readonly slackSteps: number
  readonly step: number
}

export type BattleCommand = 'reel' | 'power_reel' | 'hold' | 'give' | 'loosen_drag' | 'tighten_drag'

export type BattleOutcome = 'continue' | 'landing' | 'line_break' | 'hook_escape'

export type BattleStepResult = {
  readonly numbers: BattleNumbers
  readonly log: readonly string[]
  readonly events: readonly FishingEvent[]
  readonly outcome: BattleOutcome
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const ratio = (value: number, max: number): number => (max <= 0 ? 0 : clamp(value / max, 0, 1))

/** 魚の行動ごとの「コマンドの効き方」。数値はすべて generic（魚種ではない）。 */
type BehaviourModifiers = {
  readonly distance: number
  readonly tension: number
  readonly hookLoss: number
  readonly stamina: number
  /** その行動のときに魚がラインを引く強さ（テンションの押し上げ）。 */
  readonly pull: number
}

const BEHAVIOUR_MODIFIERS: Readonly<Record<BattleBehaviour, BehaviourModifiers>> = {
  normal: { distance: 1, tension: 1, hookLoss: 0, stamina: 1, pull: 0.15 },
  run: { distance: 0.35, tension: 2.4, hookLoss: 0.012, stamina: 1.15, pull: 1 },
  surge: { distance: 0.2, tension: 3.2, hookLoss: 0.03, stamina: 1.3, pull: 1.5 },
  head_shake: { distance: 0.55, tension: 1.5, hookLoss: 0.05, stamina: 0.9, pull: 0.6 },
  dive: { distance: 0.45, tension: 1.7, hookLoss: 0.02, stamina: 1.1, pull: 0.9 },
  come_toward: { distance: 1.6, tension: 0.6, hookLoss: 0.01, stamina: 0.8, pull: 0.1 },
  rest: { distance: 1.5, tension: 0.5, hookLoss: 0, stamina: 1.4, pull: 0 },
  second_run: { distance: 0.25, tension: 2.8, hookLoss: 0.02, stamina: 1.25, pull: 1.1 },
}

/** ドラグの効き（硬いほど止まるがテンションが上がる）。 */
const dragTensionFactor = (drag: number, tuning: BattleTuning): number =>
  tuning.dragTensionGainAtLoose +
  (tuning.dragTensionGainAtTight - tuning.dragTensionGainAtLoose) * clamp(drag, 0, 1)

const dragDistanceFactor = (drag: number, tuning: BattleTuning): number =>
  1 + tuning.dragDistanceGainAtLoose * (1 - clamp(drag, 0, 1))

const contextOf = (numbers: BattleNumbers): BehaviourContext => ({
  staminaRatio: ratio(numbers.stamina, numbers.staminaMax),
  tensionRatio: ratio(numbers.tension, numbers.maxTension),
  distanceM: numbers.distanceM,
})

/** 1 step 分のバトルを進める。 */
export const stepBattle = (input: {
  readonly numbers: BattleNumbers
  readonly command: BattleCommand
  readonly profile: FishBattleProfile
  readonly modifiers: PlayerFishingModifiers
  readonly tuning: BattleTuning
  readonly random: RandomSource
  readonly knowledgeScore: number
}): BattleStepResult => {
  const { numbers, profile, modifiers, tuning, random } = input
  const log: string[] = []
  const events: FishingEvent[] = []
  const variant = random.int(0, 1)
  const behaviour = numbers.behaviour
  const behaviourModifiers = BEHAVIOUR_MODIFIERS[behaviour]

  let nextBehaviour: BattleBehaviour = behaviour
  let nextStepsRemaining = numbers.behaviourStepsRemaining
  let pendingBehaviour = numbers.pendingBehaviour
  let nextDistance = numbers.distanceM

  if (pendingBehaviour !== null) {
    nextBehaviour = pendingBehaviour
    nextStepsRemaining = rollBehaviour({ profile, context: contextOf(numbers), random }).steps
    pendingBehaviour = null
    log.push(battleText('behaviour_start', variant))

    if (nextBehaviour === 'run' || nextBehaviour === 'surge' || nextBehaviour === 'second_run') {
      events.push('RUN_STARTED')
    }
  } else if (nextStepsRemaining > 0) {
    nextStepsRemaining -= 1
  } else {
    const rolled = rollBehaviour({ profile, context: contextOf(numbers), random })

    if (rolled.behaviour === 'rest' || rolled.behaviour === 'normal') {
      nextBehaviour = rolled.behaviour
      nextStepsRemaining = rolled.steps - 1
    } else {
      // 予兆を先に出し、次の step で発動する（文章から読めるようにする）。
      pendingBehaviour = rolled.behaviour
      nextBehaviour = behaviour
      nextStepsRemaining = 0
    }

    log.push(behaviourHint(rolled.behaviour, input.knowledgeScore, variant))
  }

  const sizeGain = 1 + 0.55 * (profile.sizeFactor - 1)
  const sizePull = clamp(
    1 / (0.55 + 0.35 * profile.sizeFactor),
    tuning.reelPullMin,
    tuning.reelPullMax,
  )
  const pullMultiplier = Math.max(0.5, profile.burstPower)
  const reelPower = sizePull * modifiers.reelEfficiencyMultiplier * behaviourModifiers.distance
  const tensionScale = behaviourModifiers.tension * dragTensionFactor(numbers.drag, tuning)
  const tensionGainBase = tuning.reelTensionGain * modifiers.tensionGainMultiplier
  const staminaDrainScale = behaviourModifiers.stamina / Math.max(0.4, profile.endurance)
  const running = behaviour === 'run' || behaviour === 'surge' || behaviour === 'second_run'

  let tension = numbers.tension
  let stamina = numbers.stamina
  let drag = numbers.drag
  let hookHold = numbers.hookHold
  let slackSteps = numbers.slackSteps

  switch (input.command) {
    case 'reel':
    case 'power_reel': {
      const isPower = input.command === 'power_reel'
      const distanceMultiplier = isPower ? tuning.powerReelDistanceMultiplier : 1
      const staminaMultiplier = isPower ? tuning.powerReelStaminaMultiplier : 1
      const tensionMultiplier = isPower ? tuning.powerReelTensionMultiplier : 1
      const pulled = tuning.reelDistanceM * reelPower * distanceMultiplier
      const effective = running ? pulled * 0.5 : pulled

      nextDistance = Math.max(0, nextDistance - effective)
      stamina = Math.max(
        0,
        stamina -
          tuning.reelStaminaDrain *
            staminaMultiplier *
            reelPower *
            staminaDrainScale *
            modifiers.reelEfficiencyMultiplier,
      )
      tension = Math.min(
        numbers.maxTension,
        tension +
          tensionGainBase *
            tensionMultiplier *
            tensionScale *
            (0.75 + 0.5 * pullMultiplier) *
            (behaviour === 'rest' ? 0.5 : 1),
      )
      hookHold -= behaviourModifiers.hookLoss * (isPower ? 1.4 : 1)
      log.push(
        isPower && running
          ? battleText('power_reel_danger', variant)
          : effective < tuning.reelDistanceM * 0.6
            ? battleText('reel_heavy', variant)
            : battleText('reel_effective', variant),
      )
      break
    }

    case 'hold': {
      nextDistance = Math.max(
        0,
        nextDistance - tuning.reelDistanceM * reelPower * tuning.holdDistanceMultiplier,
      )
      stamina = Math.max(
        0,
        stamina - tuning.reelStaminaDrain * tuning.holdStaminaMultiplier * staminaDrainScale,
      )
      tension = Math.max(
        0,
        tension +
          (running
            ? tensionGainBase * 0.35 * tensionScale
            : behaviour === 'rest'
              ? 0
              : tuning.holdTensionGain * dragTensionFactor(numbers.drag, tuning)),
      )
      hookHold -= behaviourModifiers.hookLoss * 0.4
      log.push(battleText('normal_hold', variant))
      break
    }

    case 'give': {
      nextDistance += tuning.giveDistanceM * sizeGain * dragDistanceFactor(numbers.drag, tuning)
      tension = Math.max(
        0,
        tension -
          tuning.giveTensionRelief *
            modifiers.giveEfficiencyMultiplier *
            (running ? tuning.runGiveReliefMultiplier : 1),
      )
      stamina = Math.min(
        numbers.staminaMax,
        stamina + tuning.giveStaminaRecovery / Math.max(0.5, profile.endurance),
      )
      hookHold -= behaviourModifiers.hookLoss * 0.5
      log.push(
        behaviour === 'come_toward'
          ? battleText('give_slack_risk', variant)
          : battleText('give_relief', variant),
      )
      break
    }

    case 'loosen_drag': {
      drag = clamp(drag - tuning.dragStep, tuning.dragMin, tuning.dragMax)
      tension = Math.max(0, tension - 0.04)
      nextDistance += 0.6 * sizeGain
      log.push(battleText('drag_loosened', variant))
      break
    }

    case 'tighten_drag': {
      drag = clamp(drag + tuning.dragStep, tuning.dragMin, tuning.dragMax)
      tension = Math.min(numbers.maxTension, tension + 0.02 * dragTensionFactor(drag, tuning))
      log.push(battleText('drag_tightened', variant))
      break
    }
  }

  // 走っている魚は距離が増える。
  // ラインを張って耐える（HOLD）と走りを抑えられ、送る（GIVE）と出てしまう。
  if (running) {
    const commandScale =
      input.command === 'hold'
        ? 0.5
        : input.command === 'give'
          ? 1.15
          : input.command === 'loosen_drag'
            ? 1.2
            : 1
    const runGain =
      (behaviour === 'surge' ? 3 : behaviour === 'second_run' ? 3.2 : 1.8) *
      sizeGain *
      dragDistanceFactor(drag, tuning) *
      (0.7 + 0.3 * profile.burstPower) *
      commandScale

    nextDistance += runGain
  }

  /*
   * 魚がラインを引く分。
   *
   * 走っている / 突進している魚は、こちらが何をしていてもテンションを押し上げる。
   * 同じ引きでも「耐えられるテンション（maxTension）」が低いタックルほど
   * 上限に対する割合は大きく上がるので、軽いタックルは break しやすい。
   * ここは数値だけを見る（魚種名も行動名の意味も知らない）。
   */
  const pullTension =
    tuning.fishPullTensionGain *
    behaviourModifiers.pull *
    (0.6 + 0.4 * pullMultiplier) *
    // 小さい魚はラインを引けない（小型魚のファイトを長くも危険にもしない）。
    // Phase 18A: 上限は tuning で持ち、大型魚は 1.0 を超えて強く引ける。
    clamp(0.35 * profile.sizeFactor, 0.25, tuning.fishPullSizeScaleMax)

  if (pullTension > 0) {
    tension = Math.min(numbers.maxTension, tension + pullTension)
  }

  // スラック（緩みすぎ）はフックを痛める。
  if (tension <= numbers.maxTension * tuning.slackTensionThreshold) {
    slackSteps += 1
    hookHold -= tuning.hookHoldLossOnSlack

    if (slackSteps >= tuning.slackStepsBeforeEscape) {
      log.push(battleText('slack_warning', variant))
    }
  } else {
    slackSteps = 0
  }

  if (behaviour === 'rest') {
    hookHold += tuning.hookHoldRecoveryOnRest
    stamina = Math.min(numbers.staminaMax, stamina + tuning.giveStaminaRecovery)
    events.push('FISH_TIRED')
  }

  hookHold = Math.max(0, hookHold - tuning.hookHoldLossPerStep)

  if (tension >= numbers.maxTension * 0.85) {
    log.push(battleText('tension_high', variant))
  }

  if (hookHold < 0.35) {
    log.push(battleText('hook_hold_low', variant))
  }

  let outcome: BattleOutcome = 'continue'

  if (tension >= numbers.maxTension) {
    outcome = 'line_break'
    log.push(battleText('line_break', variant))
    events.push('LINE_BREAK')
  } else if (hookHold <= 0 || slackSteps >= tuning.slackStepsBeforeEscape) {
    outcome = 'hook_escape'
    log.push(battleText('hook_escape', variant))
    events.push('HOOK_ESCAPE')
  } else if (nextDistance <= tuning.landingDistanceM) {
    outcome = 'landing'
    log.push(battleText('landing_ready', variant))
    events.push('LANDING_STARTED')
  }

  return {
    numbers: {
      ...numbers,
      tension,
      stamina,
      distanceM: Math.max(0, nextDistance),
      hookHold: clamp(hookHold, 0, Math.max(0.01, profile.hookHoldCapacity)),
      drag,
      behaviour: nextBehaviour,
      behaviourStepsRemaining: Math.max(0, nextStepsRemaining),
      pendingBehaviour,
      slackSteps,
      step: numbers.step + 1,
    },
    log,
    events,
    outcome,
  }
}

/**
 * LANDING の 1 step。
 *
 * `land` は取り込みの試行。魚がまだ元気 / 暴れていると失敗する（再び走られる）。
 * `wait` は待つ（魚が落ち着くのを待つが、その間に距離が開く）。
 */
export const attemptLanding = (input: {
  readonly numbers: BattleNumbers
  readonly command: 'land' | 'wait'
  readonly profile: FishBattleProfile
  readonly modifiers: PlayerFishingModifiers
  readonly tuning: BattleTuning
  readonly random: RandomSource
}): BattleStepResult => {
  const { numbers, modifiers, tuning, random } = input
  const log: string[] = []
  const events: FishingEvent[] = []
  const variant = random.int(0, 1)
  const staminaRatio = ratio(numbers.stamina, numbers.staminaMax)
  const struggling =
    numbers.behaviour === 'run' ||
    numbers.behaviour === 'surge' ||
    numbers.behaviour === 'second_run' ||
    numbers.behaviour === 'head_shake'

  if (input.command === 'wait') {
    /*
     * 待つ = 魚が落ち着くのを待つ。無理に取り込まない代わりに距離は少し開くが、
     * 様子（行動）は変わるので、いずれ落ち着いて取り込める。
     * ここで大きく距離が開くと「待つ」が膠着の原因になるため、控えめにする。
     */
    const distance = numbers.distanceM + (struggling ? 1.5 : 0.5)
    const stamina = Math.min(numbers.staminaMax, numbers.stamina + 0.01)
    const tension = Math.max(0, numbers.tension - 0.06 * modifiers.giveEfficiencyMultiplier)
    // 待っている間も魚の様子は変わる（落ち着けば取り込める）。
    const rolled = rollBehaviour({
      profile: input.profile,
      context: {
        staminaRatio,
        tensionRatio: ratio(numbers.tension, numbers.maxTension),
        distanceM: distance,
      },
      random,
    })

    return {
      numbers: {
        ...numbers,
        tension,
        stamina,
        distanceM: distance,
        behaviour: rolled.behaviour,
        behaviourStepsRemaining: rolled.steps,
        pendingBehaviour: null,
        step: numbers.step + 1,
      },
      log: [
        struggling ? battleText('landing_failed', variant) : battleText('normal_hold', variant),
      ],
      events,
      outcome: 'continue',
    }
  }

  // 大型魚は取り込みにくい（まだ暴れていると特に）。
  const sizePenalty = 0.2 * clamp((input.profile.sizeFactor - 1) / 4, 0, 1)
  const chance = clamp(
    tuning.landingSuccessBase +
      tuning.landingStaminaFactor * (1 - staminaRatio) +
      tuning.landingHookHoldFactor * numbers.hookHold -
      (struggling ? 0.35 : 0) -
      sizePenalty,
    0.05,
    0.9,
  )
  /*
   * Tackle（landing stability）は成功率に掛かるが、上限は 1.0 未満に抑える。
   * ここが 1.0 を超えると「落ち着いていれば必ず取り込める」になり、
   * 取り込みの駆け引きが死ぬ。
   */
  const success = random.next() < clamp(chance * modifiers.landingStabilityMultiplier, 0.05, 0.95)

  if (success) {
    log.push(battleText('landing_success', variant))
    events.push('LANDED')

    return { numbers: { ...numbers, step: numbers.step + 1 }, log, events, outcome: 'landing' }
  }

  log.push(battleText('landing_failed', variant))
  const hookHold = Math.max(0, numbers.hookHold - tuning.landingAttemptHookHoldLoss)

  if (hookHold <= 0) {
    log.push(battleText('hook_escape', variant))
    events.push('HOOK_ESCAPE')

    return {
      numbers: { ...numbers, hookHold, step: numbers.step + 1 },
      log,
      events,
      outcome: 'hook_escape',
    }
  }

  return {
    numbers: {
      ...numbers,
      distanceM: numbers.distanceM + tuning.landingAttemptFailurePenaltyM,
      hookHold,
      behaviour: 'run',
      behaviourStepsRemaining: 1,
      step: numbers.step + 1,
    },
    log,
    events,
    outcome: 'continue',
  }
}

export { battleText, behaviourHint }
